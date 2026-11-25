import type { Build, BuildOrder, Item, ItemStat, OrderStep } from './api'
import { dec, tr } from './i18n'
import { isBuyable } from './shop'

// Ordena os itens de uma build usando dados reais de partidas (grátis, sem IA).
// Ideia: a hora média em que os jogadores compram cada item é um bom proxy da ordem de compra.

type Phase = OrderStep['phase']
const PHASES: Phase[] = ['inicio', 'meio', 'fim']

// Grupos que o autor marca como "se precisar" não devem competir com os itens centrais
const SITUATIONAL =
  /situat|counter|optional|opcion|swap|replace|luxury|\bfun\b|misc|testing|bad lane|\bif\b|alternativ|as needed|\bwhen\b/i

export function phaseFromName(name: string): number | null {
  // palavras que dizem a fase valem mais que as indiretas: "Late Game Core" é fim, não meio
  const explicit = [/early|in[ií]cio/i, /\bmid|meio/i, /late(?!r)|final|\bfim\b|\bend\b/i]
    .map((re, phase) => (re.test(name) ? phase : null))
    .filter((p): p is number => p !== null)
  if (explicit.length === 1) return explicit[0]
  if (explicit.length > 1) return null // "Early-Mid", "Mid/Late": cada item vai pela hora de compra
  if (/after\s*lan/i.test(name)) return 1
  if (/\blane\b|laning|start|opening/i.test(name)) return 0
  if (/core/i.test(name)) return 1
  if (/luxury|peak/i.test(name)) return 2
  return null
}

export function formatTime(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Regressão linear simples (custo -> hora de compra) para itens sem estatística
function fitCostToTime(stats: ItemStat[], items: Record<number, Item>) {
  const pts = stats
    .filter((s) => items[s.itemId]?.cost > 0)
    .map((s) => ({ x: items[s.itemId].cost, y: s.avgBuyTimeS }))
  if (pts.length < 8) return null
  const n = pts.length
  const mx = pts.reduce((a, p) => a + p.x, 0) / n
  const my = pts.reduce((a, p) => a + p.y, 0) / n
  const sxx = pts.reduce((a, p) => a + (p.x - mx) ** 2, 0)
  if (sxx === 0) return null
  const slope = pts.reduce((a, p) => a + (p.x - mx) * (p.y - my), 0) / sxx
  if (slope <= 0) return null
  return (cost: number) => my + slope * (cost - mx)
}

interface Candidate {
  id: number
  phase: number
  situational: boolean
  authorIdx: number
  time: number
  source: 'data' | 'estimated' | 'author'
  stat?: ItemStat
}

export function computeOrder(
  build: Build,
  items: Record<number, Item>,
  stats: ItemStat[],
): BuildOrder {
  const statById = new Map(stats.map((s) => [s.itemId, s]))
  const estimate = fitCostToTime(stats, items)

  // A fase vem do nome do grupo do autor. Se o nome não diz a fase, ou se a hora real de compra a
  // contradiz muito (início x fim), vale a hora média de compra (até 12 min / até 25 min / depois).
  const hasPhases = build.categories.filter((c) => phaseFromName(c.name) !== null).length >= 2
  const phaseByTime = (t: number) => (t < 720 ? 0 : t < 1500 ? 1 : 2)

  const seen = new Set<number>()
  const cands: Candidate[] = []
  let authorIdx = 0

  build.categories.forEach((cat) => {
    const byName = phaseFromName(cat.name)
    const situational = SITUATIONAL.test(cat.name) || SITUATIONAL.test(cat.description)

    for (const id of cat.itemIds) {
      const item = items[id]
      if (!item || !isBuyable(items, id) || seen.has(id)) continue
      seen.add(id)
      const stat = statById.get(id)
      let time: number
      let source: Candidate['source']
      if (stat) {
        time = stat.avgBuyTimeS
        source = 'data'
      } else if (estimate) {
        time = estimate(item.cost)
        source = 'estimated'
      } else {
        time = authorIdx * 90
        source = 'author'
      }
      const byTime = phaseByTime(time)
      const phase = byName === null || Math.abs(byName - byTime) > 1 ? byTime : byName
      cands.push({ id, phase, situational, authorIdx: authorIdx++, time, source, stat })
    }
  })

  cands.sort(
    (a, b) =>
      a.phase - b.phase ||
      Number(a.situational) - Number(b.situational) ||
      a.time - b.time ||
      a.authorIdx - b.authorIdx,
  )

  // Uma melhoria consome o item anterior: se a build tem os dois, o anterior precisa vir antes.
  const candById = new Map(cands.map((c) => [c.id, c]))
  const placed = new Set<number>()
  const ordered: (Candidate & { neededFor?: number })[] = []
  function place(c: Candidate, phase: number, neededFor?: number) {
    if (placed.has(c.id)) return
    placed.add(c.id)
    const at = Math.min(c.phase, phase)
    for (const part of items[c.id].components) {
      const found = candById.get(part)
      if (found) place(found, at, c.id)
    }
    // só marca quando a peça precisou ser adiantada
    const moved = neededFor !== undefined && cands.indexOf(c) > cands.indexOf(candById.get(neededFor)!)
    ordered.push({ ...c, phase: at, situational: moved ? false : c.situational, neededFor: moved ? neededFor : undefined })
  }
  for (const c of cands) place(c, c.phase)

  const steps: OrderStep[] = ordered.map((c) => {
    let reason: string
    if (c.source === 'data' && c.stat) {
      const time = formatTime(c.stat.avgBuyTimeS)
      reason = tr(`Comprado em média aos ${time}`, `Bought around ${time} on average`)
      if (c.stat.matches >= 200) reason += ` · ${dec(c.stat.winRate * 100, 0)}% ${tr('de vitória', 'win rate')}`
    } else if (c.source === 'estimated') {
      reason = tr(
        `Sem dados de partida; hora estimada pelo custo (~${formatTime(c.time)})`,
        `No match data; time estimated from cost (~${formatTime(c.time)})`,
      )
    } else {
      reason = tr('Sem dados de partida; mantido na ordem do autor', "No match data; kept in the author's order")
    }
    if (c.situational) reason += tr(' · situacional (compre se precisar)', ' · situational (buy if needed)')
    if (c.neededFor !== undefined)
      reason += tr(` · adiantado porque vira ${items[c.neededFor].name}`, ` · moved up because it becomes ${items[c.neededFor].name}`)
    return { itemId: c.id, phase: PHASES[c.phase], reason, fromAi: true }
  })

  const withData = cands.filter((c) => c.source === 'data').length
  const situational = cands.filter((c) => c.situational).length
  const summary =
    tr(
      `Ordem calculada pela hora média em que os jogadores compram cada item nas partidas recentes (${withData} de ${cands.length} itens com dados). `,
      `Order based on the average time players buy each item in recent matches (${withData} of ${cands.length} items with data). `,
    ) +
    (hasPhases
      ? tr(
          'As fases seguem os grupos do autor quando o nome indica a fase; nos outros casos, a hora média de compra. ',
          "Phases follow the author's groups when the name indicates a phase; otherwise, the average purchase time. ",
        )
      : tr(
          'O autor não separou a build por fase, então as fases vêm da hora média de compra. ',
          "The author didn't split the build into phases, so phases come from the average purchase time. ",
        )) +
    tr('Dentro de cada fase, os itens centrais vêm primeiro', 'Within each phase, core items come first') +
    (situational > 0
      ? tr(` e os ${situational} situacionais ficam no fim dela.`, ` and the ${situational} situational ones go last.`)
      : '.')

  return { steps, summary, model: tr('dados de partidas', 'match data') }
}

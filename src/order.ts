import type { Build, BuildOrder, Item, ItemStat, OrderStep } from './api'

// Ordena os itens de uma build usando dados reais de partidas (grátis, sem IA).
// Ideia: a hora média em que os jogadores compram cada item é um bom proxy da ordem de compra.

type Phase = OrderStep['phase']
const PHASES: Phase[] = ['inicio', 'meio', 'fim']

// Grupos que o autor marca como "se precisar" não devem competir com os itens centrais
const SITUATIONAL =
  /situat|counter|optional|opcion|swap|replace|luxury|\bfun\b|misc|testing|bad lane|\bif\b|alternativ|as needed|\bwhen\b/i

export function phaseFromName(name: string): number | null {
  if (/early|in[ií]cio|\blane\b|start|opening/i.test(name)) return 0
  if (/\bmid|core|meio/i.test(name)) return 1
  if (/late|final|\bfim\b|luxury|peak|\bend\b/i.test(name)) return 2
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
  const lastCat = Math.max(1, build.categories.length - 1)

  // Se o autor não separou a build em fases (grupos sem nome, "Grupo 1"...), não dá para confiar nos
  // grupos: as fases passam a vir da hora média de compra (até 12 min / até 25 min / depois).
  const hasPhases = build.categories.filter((c) => phaseFromName(c.name) !== null).length >= 2
  const phaseByTime = (t: number) => (t < 720 ? 0 : t < 1500 ? 1 : 2)

  const seen = new Set<number>()
  const cands: Candidate[] = []
  let authorIdx = 0

  build.categories.forEach((cat, ci) => {
    const byName = phaseFromName(cat.name)
    const byPosition = Math.min(2, Math.floor((ci / lastCat) * 3 - 1e-9))
    const phase = byName ?? Math.max(0, byPosition)
    const situational = SITUATIONAL.test(cat.name) || SITUATIONAL.test(cat.description)

    for (const id of cat.itemIds) {
      const item = items[id]
      if (!item || seen.has(id)) continue
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
      cands.push({ id, phase: hasPhases ? phase : phaseByTime(time), situational, authorIdx: authorIdx++, time, source, stat })
    }
  })

  cands.sort(
    (a, b) =>
      a.phase - b.phase ||
      Number(a.situational) - Number(b.situational) ||
      a.time - b.time ||
      a.authorIdx - b.authorIdx,
  )

  const steps: OrderStep[] = cands.map((c) => {
    let reason: string
    if (c.source === 'data' && c.stat) {
      reason = `Comprado em média aos ${formatTime(c.stat.avgBuyTimeS)}`
      if (c.stat.matches >= 200) reason += ` · ${(c.stat.winRate * 100).toFixed(0)}% de vitória`
    } else if (c.source === 'estimated') {
      reason = `Sem dados de partida; hora estimada pelo custo (~${formatTime(c.time)})`
    } else {
      reason = 'Sem dados de partida; mantido na ordem do autor'
    }
    if (c.situational) reason += ' · situacional (compre se precisar)'
    return { itemId: c.id, phase: PHASES[c.phase], reason, fromAi: true }
  })

  const withData = cands.filter((c) => c.source === 'data').length
  const situational = cands.filter((c) => c.situational).length
  const summary =
    `Ordem calculada pela hora média em que os jogadores compram cada item nas partidas recentes ` +
    `(${withData} de ${cands.length} itens com dados). ` +
    (hasPhases
      ? 'As fases seguem os grupos do autor. '
      : 'O autor não separou a build por fase, então as fases vêm da hora média de compra. ') +
    `Dentro de cada fase, os itens centrais vêm primeiro` +
    (situational > 0 ? ` e os ${situational} situacionais ficam no fim dela.` : '.')

  return { steps, summary, model: 'dados de partidas' }
}

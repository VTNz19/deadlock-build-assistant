import {
  getEnemyItemStats,
  getItemStats,
  type Build,
  type BuildOrder,
  type Hero,
  type Item,
  type ItemStat,
} from './api'
import { THREATS, findCounters, type CounterItem, type ThreatId } from './counters'
import { computeMatchup } from './matchup'
import { computeOrder, phaseFromName } from './order'
import { pp, tr, tx, type Text } from './i18n'

// ---------- 1) dados pesados (chamadas à API) ----------

export interface EnemyInfo {
  hero: Hero
  spiritShare: number | null // 0..1: quanto do dano vem de habilidades (estimado), null se sem dados
}

export interface Combined {
  delta: number // diferença média de taxa de vitória contra o time inimigo (0.03 = +3 p.p.)
  n: number // partidas por inimigo (média)
  reliable: boolean
}

export interface CompData {
  base: ItemStat[]
  enemies: EnemyInfo[]
  failed: string[] // inimigos sem dados (API ocupada, poucas partidas...)
  combined: Map<number, Combined>
}

// Estima se o herói causa dano de habilidade (espírito) ou de arma pelo que os jogadores dele compram
export function estimateSpiritShare(stats: ItemStat[], items: Record<number, Item>): number | null {
  let spirit = 0
  let gun = 0
  for (const s of stats) {
    const p = items[s.itemId]?.props
    if (!p) continue
    if ((p.TechPower ?? 0) > 0) spirit += s.matches
    if ((p.BaseAttackDamagePercent ?? 0) > 0 || (p.BonusFireRate ?? 0) > 0) gun += s.matches
  }
  return spirit + gun >= 1000 ? spirit / (spirit + gun) : null
}

export async function loadComp(
  me: Hero,
  enemies: Hero[],
  items: Record<number, Item>,
): Promise<CompData> {
  const base = await getItemStats(me.id)
  const baseById = new Map(base.map((s) => [s.itemId, s]))

  const settled = await Promise.allSettled(
    enemies.map(async (hero) => {
      const [stats, vs] = await Promise.all([getItemStats(hero.id), getEnemyItemStats(me.id, hero.id)])
      return { hero, stats, vs }
    }),
  )

  const infos: EnemyInfo[] = []
  const failed: string[] = []
  const acc = new Map<number, { sumDn: number; sumN: number }>()
  let withData = 0

  settled.forEach((r, i) => {
    if (r.status === 'rejected') {
      failed.push(enemies[i].name)
      return
    }
    const { hero, stats, vs } = r.value
    infos.push({ hero, spiritShare: estimateSpiritShare(stats, items) })
    const { rows } = computeMatchup(items, base, vs, 100)
    if (rows.length === 0) {
      failed.push(hero.name)
      return
    }
    withData++
    for (const row of rows) {
      const cur = acc.get(row.item.id) ?? { sumDn: 0, sumN: 0 }
      cur.sumDn += row.delta * row.vs.matches
      cur.sumN += row.vs.matches
      acc.set(row.item.id, cur)
    }
  })

  const combined = new Map<number, Combined>()
  for (const [id, { sumDn, sumN }] of acc) {
    const b = baseById.get(id)
    if (!b || withData === 0) continue
    const n = sumN / withData // conservador: não soma partidas de confrontos diferentes
    const se = Math.sqrt((b.winRate * (1 - b.winRate)) / n)
    const delta = sumDn / sumN
    combined.set(id, { delta, n, reliable: n >= 150 && Math.abs(delta) > 1.96 * se })
  }

  return { base, enemies: infos, failed, combined }
}

// ---------- 2) análise do time inimigo ----------

export interface ThreatInfo {
  id: ThreatId
  label: string
  why: string
}

export interface EnemySummary {
  spirit: number | null // média de dano de habilidade (0..1)
  brawlers: number
  healers: number
  threats: ThreatInfo[]
}

export function summarizeEnemies(enemies: EnemyInfo[]): EnemySummary {
  const known = enemies.map((e) => e.spiritShare).filter((x): x is number => x !== null)
  const spirit = known.length > 0 ? known.reduce((a, b) => a + b, 0) / known.length : null
  const brawlers = enemies.filter((e) => e.hero.hero_type === 'brawler').length
  const healers = enemies.filter((e) => e.hero.hero_type === 'healer').length
  const label = (id: ThreatId) => tx(THREATS.find((t) => t.id === id)!.label)

  const threats: ThreatInfo[] = []
  if (spirit !== null) {
    const sp = Math.round(spirit * 100)
    if (spirit >= 0.45)
      threats.push({
        id: 'spirit',
        label: label('spirit'),
        why: tr(`~${sp}% do dano estimado do time é de habilidades`, `~${sp}% of the team's estimated damage is from abilities`),
      })
    if (spirit <= 0.55)
      threats.push({
        id: 'bullet',
        label: label('bullet'),
        why: tr(`~${100 - sp}% do dano estimado do time é de disparo`, `~${100 - sp}% of the team's estimated damage is from bullets`),
      })
  }
  if (brawlers >= 2)
    threats.push({
      id: 'tank',
      label: label('tank'),
      why: tr(`${brawlers} heróis de linha de frente (lutadores)`, `${brawlers} frontline heroes (brawlers)`),
    })
  if (healers >= 1)
    threats.push({
      id: 'heal',
      label: label('heal'),
      why: tr(
        `${healers} curador${healers > 1 ? 'es' : ''} no time`,
        `${healers} healer${healers > 1 ? 's' : ''} on the team`,
      ),
    })
  return { spirit, brawlers, healers, threats }
}

export function teamNotes(me: Hero, allies: Hero[]): string[] {
  const team = [me, ...allies]
  if (team.length < 3) return []
  const count = (t: string) => team.filter((h) => h.hero_type === t).length
  const notes: string[] = []
  if (count('healer') === 0)
    notes.push(
      tr('Seu time não tem curador: o sustain vai ter que vir dos itens.', 'Your team has no healer: sustain will have to come from items.'),
    )
  if (count('brawler') === 0)
    notes.push(
      tr(
        'Seu time não tem herói de linha de frente (lutador): cuidado com quem avança.',
        'Your team has no frontline hero (brawler): be careful about who pushes forward.',
      ),
    )
  if (count('marksman') + count('assassin') === 0)
    notes.push(tr('Seu time tem pouco dano à distância ou de explosão.', 'Your team is low on ranged or burst damage.'))
  return notes
}

// ---------- 3) build adaptada à composição ----------

export interface Plan {
  adapted: Build
  order: BuildOrder
  picks: Map<number, string> // itens acrescentados -> motivo
  removed: { item: Item; delta: number }[] // itens da build que rendem pior contra este time
}

const PHASE_NAMES: Text[] = [
  ['Início do jogo', 'Early game'],
  ['Meio do jogo', 'Mid game'],
  ['Fim do jogo', 'Late game'],
]

function phaseOf(item: Item, base: Map<number, ItemStat>): number {
  const t = base.get(item.id)?.avgBuyTimeS
  if (t !== undefined) return t < 720 ? 0 : t < 1500 ? 1 : 2
  return item.tier <= 1 ? 0 : item.tier === 2 ? 1 : 2
}

export function makePlan(
  data: CompData,
  summary: EnemySummary,
  build: Build,
  items: Record<number, Item>,
): Plan {
  const baseById = new Map(data.base.map((s) => [s.itemId, s]))
  const inBuild = new Set(build.categories.flatMap((c) => c.itemIds))

  // itens da build que, pelos dados, rendem claramente pior contra este time
  const removed = [...inBuild]
    .map((id) => ({ item: items[id], c: data.combined.get(id) }))
    .filter((x): x is { item: Item; c: Combined } => !!x.item && !!x.c && x.c.reliable && x.c.delta <= -0.03)
    .sort((a, b) => a.c.delta - b.c.delta)
    .slice(0, 2)
    .map((x) => ({ item: x.item, delta: x.c.delta }))
  const removedIds = new Set(removed.map((r) => r.item.id))

  const picks = new Map<number, string>()
  const worse = (id: number) => {
    const c = data.combined.get(id)
    return !!c && c.reliable && c.delta <= -0.02
  }

  // contra cada ameaça: os itens com efeito mais forte (que não rendam mal contra este time)
  for (const t of summary.threats) {
    const threat = THREATS.find((x) => x.id === t.id)!
    const counters: CounterItem[] = findCounters(threat, items, baseById)
      .filter((c) => !inBuild.has(c.item.id) && !picks.has(c.item.id) && !worse(c.item.id))
      .sort((a, b) => b.strength - a.strength || a.item.cost - b.item.cost)
    const perThreat = summary.threats.length <= 2 ? 2 : 1
    for (const c of counters.slice(0, perThreat)) {
      if (picks.size >= 4) break
      picks.set(c.item.id, `${tr('Contra', 'Counters')} ${t.label.toLowerCase()}: ${c.effects[0]}`)
    }
  }

  // itens que se destacam contra este time só pelos dados
  const extras = [...data.combined.entries()]
    .filter(([id, c]) => c.reliable && c.delta >= 0.02 && items[id]?.shopable && !inBuild.has(id) && !picks.has(id))
    .sort((a, b) => b[1].delta - a[1].delta)
    .slice(0, 2)
  for (const [id, c] of extras)
    picks.set(id, tr(`Rende ${pp(c.delta)} contra este time (pelos dados)`, `${pp(c.delta)} against this team (from match data)`))

  // monta a build adaptada: tira os piores e põe os novos na fase em que costumam ser comprados
  const categories = build.categories.map((c) => ({ ...c, itemIds: c.itemIds.filter((id) => !removedIds.has(id)) }))
  for (const id of picks.keys()) {
    const name = tx(PHASE_NAMES[phaseOf(items[id], baseById)])
    const cat = categories.find((c) => c.name === name)
    if (cat) cat.itemIds = [...cat.itemIds, id]
    else categories.push({ name, description: '', itemIds: [id] })
  }
  const adapted: Build = { ...build, categories: categories.filter((c) => c.itemIds.length > 0) }

  return { adapted, order: computeOrder(adapted, items, data.base), picks, removed }
}

// Algumas builds têm grupos sem nome ("Grupo 1"...), que não dizem em que fase comprar.
// Por padrão uso a primeira (mais favoritada) que tenha pelo menos 2 fases marcadas.
export function pickDefaultBuild(builds: Build[]): number {
  const i = builds.findIndex((b) => b.categories.filter((c) => phaseFromName(c.name) !== null).length >= 2)
  return i >= 0 ? i : 0
}

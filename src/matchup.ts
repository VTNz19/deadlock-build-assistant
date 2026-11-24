import type { Item, ItemStat } from './api'

export interface MatchupRow {
  item: Item
  vs: ItemStat
  base: ItemStat
  expected: number // taxa geral do item + efeito do confronto
  delta: number // taxa real contra o inimigo menos a esperada (0.03 = +3 pontos percentuais)
  reliable: boolean // diferença maior do que o ruído esperado
}

// Compara a taxa de vitória de cada item contra um herói inimigo com a taxa geral.
// Contra certos heróis o seu herói inteiro rende menos (ou mais). Esse efeito do confronto puxa
// TODOS os itens para o mesmo lado, então eu o tiro (`shift`) antes de comparar um item com o outro.
export function computeMatchup(
  items: Record<number, Item>,
  baseStats: ItemStat[],
  vsStats: ItemStat[] | null,
  minMatches: number,
): { rows: MatchupRow[]; shift: number } {
  if (!vsStats) return { rows: [], shift: 0 }
  const baseById = new Map(baseStats.map((s) => [s.itemId, s]))
  const pairs: { item: Item; vs: ItemStat; base: ItemStat }[] = []
  for (const vs of vsStats) {
    const item = items[vs.itemId]
    const base = baseById.get(vs.itemId)
    if (!item || !item.shopable || !base || vs.matches < minMatches) continue
    pairs.push({ item, vs, base })
  }
  const total = pairs.reduce((a, p) => a + p.vs.matches, 0)
  const shift =
    total > 0 ? pairs.reduce((a, p) => a + (p.vs.winRate - p.base.winRate) * p.vs.matches, 0) / total : 0
  const rows = pairs.map(({ item, vs, base }): MatchupRow => {
    const expected = base.winRate + shift
    const delta = vs.winRate - expected
    const se = Math.sqrt((base.winRate * (1 - base.winRate)) / vs.matches)
    return { item, vs, base, expected, delta, reliable: Math.abs(delta) > 1.96 * se }
  })
  return { rows: rows.sort((a, b) => b.delta - a.delta), shift }
}

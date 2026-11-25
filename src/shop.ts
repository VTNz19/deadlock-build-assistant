import type { Build, Item } from './api'

// Itens que a build cita mas não dá mais para comprar (removidos do jogo ou desconhecidos pela API)
export const isBuyable = (items: Record<number, Item>, id: number) => items[id]?.shopable === true

export function unavailableItems(ids: number[], items: Record<number, Item>) {
  const unique = [...new Set(ids)].filter((id) => !isBuyable(items, id))
  return {
    ids: unique,
    count: unique.length,
    // alguns itens removidos não têm nome traduzido (vem o código interno, "upgrade_...")
    names: unique.map((id) => items[id]?.name).filter((n): n is string => !!n && !n.startsWith('upgrade_')),
  }
}

export const missingCount = (build: Build, items: Record<number, Item>) =>
  unavailableItems(
    build.categories.flatMap((c) => c.itemIds),
    items,
  ).count

// Quanto menos itens fora da loja, mais alto. No empate, a ordem (por popularidade) não muda.
export const fewestMissingFirst = (builds: Build[], items: Record<number, Item>) =>
  [...builds].sort((a, b) => missingCount(a, items) - missingCount(b, items))

export interface Purchase {
  id: number
  price: number // almas pagas nesta compra
  upgrades: number[] // itens já comprados que esta compra consome
}

// No jogo, comprar uma melhoria consome o item anterior e você paga só a diferença.
export function purchases(ids: number[], items: Record<number, Item>): Purchase[] {
  const owned = new Set<number>()
  const out: Purchase[] = []
  for (const id of new Set(ids)) {
    if (!isBuyable(items, id)) continue
    const upgrades = items[id].components.filter((part) => owned.has(part))
    const discount = upgrades.reduce((sum, part) => sum + items[part].cost, 0)
    for (const part of upgrades) owned.delete(part)
    owned.add(id)
    out.push({ id, price: items[id].cost - discount, upgrades })
  }
  return out
}

export const totalCost = (list: Purchase[]) => list.reduce((sum, p) => sum + p.price, 0)

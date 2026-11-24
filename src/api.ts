import { PROP_KEYS } from './counters'

const BASE = 'https://api.deadlock-api.com'

export interface Hero {
  id: number
  name: string
  class_name: string
  player_selectable: boolean
  disabled: boolean
  hero_type?: string
  complexity?: number
  images: {
    icon_hero_card_webp?: string
    icon_image_small_webp?: string
  }
}

export interface Item {
  id: number
  name: string
  image: string
  cost: number
  tier: number
  slot: string // weapon | vitality | spirit | ...
  shopable: boolean
  desc: string // texto do efeito, sem HTML
  props: Record<string, number> // só as propriedades usadas em counters.ts
}

export interface BuildCategory {
  name: string
  description: string
  itemIds: number[]
}

export interface Build {
  id: number
  name: string
  description: string
  weeklyFavorites: number
  favorites: number
  categories: BuildCategory[]
}

export interface ItemStat {
  itemId: number
  matches: number
  wins: number
  winRate: number // 0..1
  avgBuyTimeS: number
}

// ---------- cache (memória + sessionStorage) ----------

const memory = new Map<string, unknown>()

async function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  if (memory.has(key)) return memory.get(key) as T
  const storageKey = `dl:v3:${key}`
  try {
    const raw = sessionStorage.getItem(storageKey)
    if (raw) {
      const data = JSON.parse(raw) as T
      memory.set(key, data)
      return data
    }
  } catch {
    // sessionStorage indisponível: segue sem cache persistente
  }
  const data = await load()
  memory.set(key, data)
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(data))
  } catch {
    // cheio ou bloqueado: fica só em memória
  }
  return data
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (res.status === 503 || res.status === 429)
    throw new Error('A API de dados está ocupada agora. Tente de novo em alguns segundos.')
  if (!res.ok) throw new Error(`API respondeu ${res.status} em ${path}`)
  return (await res.json()) as T
}

// ---------- heróis ----------

export function getHeroes(): Promise<Hero[]> {
  return cached('heroes', async () => {
    const all = await fetchJson<Hero[]>('/v1/assets/heroes')
    return all
      .filter((h) => h.player_selectable && !h.disabled)
      .sort((a, b) => a.name.localeCompare(b.name))
  })
}

// ---------- itens (versão enxuta: o original pesa ~6,5 MB) ----------

interface RawItem {
  type: string
  id: number
  name: string
  image?: string
  image_webp?: string
  shop_image_webp?: string
  item_slot_type?: string
  item_tier?: number
  cost?: number
  shopable?: boolean
  description?: { desc?: string }
  tooltip_sections?: { section_type: string; section_attributes?: { loc_string?: string }[] }[]
  properties?: Record<string, { value?: string | number }>
}

function stripHtml(html: string | undefined): string {
  return (html ?? '')
    .replace(/<svg[\s\S]*?<\/svg>/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function itemDescription(r: RawItem): string {
  let text = stripHtml(r.description?.desc)
  if (!text) {
    for (const sec of r.tooltip_sections ?? []) {
      if (sec.section_type === 'innate') continue
      for (const attr of sec.section_attributes ?? []) {
        text = stripHtml(attr.loc_string)
        if (text) break
      }
      if (text) break
    }
  }
  return text.length > 260 ? text.slice(0, 257) + '...' : text
}

export function getItems(): Promise<Record<number, Item>> {
  return cached('items3', async () => {
    const raw = await fetchJson<RawItem[]>('/v1/assets/items')
    const out: Record<number, Item> = {}
    for (const r of raw) {
      if (r.type !== 'upgrade') continue
      const props: Record<string, number> = {}
      for (const key of PROP_KEYS) {
        const v = Number(r.properties?.[key]?.value)
        if (r.properties?.[key] !== undefined && Number.isFinite(v)) props[key] = v
      }
      out[r.id] = {
        id: r.id,
        name: r.name,
        image: r.shop_image_webp ?? r.image_webp ?? r.image ?? '',
        cost: r.cost ?? 0,
        tier: r.item_tier ?? 0,
        slot: r.item_slot_type ?? '',
        shopable: r.shopable !== false,
        desc: itemDescription(r),
        props,
      }
    }
    return out
  })
}

// ---------- builds da comunidade ----------

interface RawBuild {
  num_weekly_favorites: number | null
  num_favorites: number | null
  hero_build: {
    hero_build_id: number
    name: string
    description: string | null
    details: {
      mod_categories: {
        name: string
        description: string | null
        mods: { ability_id: number }[]
      }[]
    }
  }
}

// A API usa chaves internas do jogo (#Citadel_HeroBuilds_EarlyGame, _Early, ...)
function categoryLabel(raw: string, index: number): string {
  const name = raw.trim()
  const m = name.match(/^#Citadel_HeroBuilds_(Early|Mid|Late)/i)
  if (m) {
    const phase = m[1].toLowerCase()
    return phase === 'early' ? 'Início do jogo' : phase === 'mid' ? 'Meio do jogo' : 'Fim do jogo'
  }
  // vazio ou abreviação sem sentido (ex.: "lr", "o")
  if (name.length <= 2 || name.startsWith('#')) return `Grupo ${index + 1}`
  return name
}

// Descrições muito curtas ("lr", ".") ou iguais ao nome do grupo só poluem a tela
function usefulText(text: string | null, ...others: string[]): string {
  const t = (text ?? '').trim()
  if (t.length <= 3) return ''
  if (others.some((o) => o.trim().toLowerCase() === t.toLowerCase())) return ''
  return t
}

function toBuild(r: RawBuild): Build {
  const cats = r.hero_build.details.mod_categories
  return {
    id: r.hero_build.hero_build_id,
    name: r.hero_build.name,
    description: usefulText(r.hero_build.description, ...cats.map((c) => c.name)),
    weeklyFavorites: r.num_weekly_favorites ?? 0,
    favorites: r.num_favorites ?? 0,
    categories: cats
      .map((c, i) => {
        const name = categoryLabel(c.name, i)
        return {
          name,
          description: usefulText(c.description, c.name, name),
          itemIds: c.mods.map((m) => m.ability_id),
        }
      })
      .filter((c) => c.itemIds.length > 0),
  }
}

export function getBuilds(heroId: number): Promise<Build[]> {
  return cached(`builds:${heroId}`, async () => {
    // Heróis novos não têm favoritos semanais, então busco as duas listas e junto.
    const base = `/v1/builds?hero_id=${heroId}&language=0&only_latest=true&sort_direction=desc&limit=15`
    const [weekly, total] = await Promise.all([
      fetchJson<RawBuild[]>(`${base}&sort_by=weekly_favorites`),
      fetchJson<RawBuild[]>(`${base}&sort_by=favorites`),
    ])
    const byId = new Map<number, Build>()
    for (const r of [...weekly, ...total]) {
      const b = toBuild(r)
      if (b.categories.length > 0 && !byId.has(b.id)) byId.set(b.id, b)
    }
    const all = [...byId.values()].sort(
      (a, b) => b.weeklyFavorites - a.weeklyFavorites || b.favorites - a.favorites,
    )
    // builds que ninguém favoritou costumam ser rascunhos; só as escondo se sobrar alguma boa
    const liked = all.filter((b) => b.weeklyFavorites > 0 || b.favorites > 0)
    return (liked.length > 0 ? liked : all).slice(0, 15)
  })
}

// ---------- estatísticas de itens ----------

interface RawItemStat {
  item_id: number
  wins: number
  matches: number
  avg_buy_time_s: number
}

export function getItemStats(heroId: number): Promise<ItemStat[]> {
  return cached(`itemstats:${heroId}`, async () => {
    const raw = await fetchJson<RawItemStat[]>(
      `/v1/analytics/item-stats?hero_id=${heroId}&min_matches=50`,
    )
    return raw.map((r) => ({
      itemId: r.item_id,
      matches: r.matches,
      wins: r.wins,
      winRate: r.matches > 0 ? r.wins / r.matches : 0,
      avgBuyTimeS: r.avg_buy_time_s,
    }))
  })
}

// Itens do seu herói contra um herói inimigo específico
export function getEnemyItemStats(heroId: number, enemyId: number): Promise<ItemStat[]> {
  return cached(`itemstats:${heroId}:vs:${enemyId}`, async () => {
    const raw = await fetchJson<RawItemStat[]>(
      `/v1/analytics/item-stats?hero_id=${heroId}&enemy_hero_ids=${enemyId}&min_matches=30`,
    )
    return raw.map((r) => ({
      itemId: r.item_id,
      matches: r.matches,
      wins: r.wins,
      winRate: r.matches > 0 ? r.wins / r.matches : 0,
      avgBuyTimeS: r.avg_buy_time_s,
    }))
  })
}

// ---------- ordem de compra montada pela IA ----------

export interface OrderStep {
  itemId: number
  phase: 'inicio' | 'meio' | 'fim'
  reason: string
  fromAi: boolean
}

export interface BuildOrder {
  steps: OrderStep[]
  summary: string
  model: string
}

export function getBuildOrder(
  hero: Hero,
  build: Build,
  items: Record<number, Item>,
  stats: ItemStat[],
): Promise<BuildOrder> {
  return cached(`order:${hero.id}:${build.id}`, async () => {
    const statById = new Map(stats.map((s) => [s.itemId, s]))
    const body = {
      heroName: hero.name,
      buildName: build.name,
      buildDescription: build.description,
      categories: build.categories.map((c) => ({
        name: c.name,
        description: c.description,
        items: c.itemIds
          .filter((id) => items[id])
          .map((id) => {
            const it = items[id]
            const st = statById.get(id)
            return {
              id,
              name: it.name,
              cost: it.cost,
              tier: it.tier,
              slot: it.slot,
              avgBuyMin: st ? st.avgBuyTimeS / 60 : undefined,
              winRate: st?.winRate,
              matches: st?.matches,
            }
          }),
      })),
    }
    const res = await fetch('/api/order', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = (await res.json().catch(() => ({}))) as BuildOrder & { error?: string }
    if (!res.ok) {
      throw new Error(
        data.error ??
          (res.status === 404 || res.status === 502
            ? 'Servidor da IA fora do ar. Rode "npm run server" em outro terminal.'
            : `Erro ${res.status}`),
      )
    }
    return data
  })
}

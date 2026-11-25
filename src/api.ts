import { MAX_PER_ABILITY, popularOrder, type OrderRow, type PopularOrder } from './abilities'
import { PROP_KEYS } from './counters'
import { getLang, num, tr } from './i18n'

const BASE = 'https://api.deadlock-api.com'

export type Lang = 'pt' | 'en'
const API_LANGUAGE: Record<Lang, string> = { pt: 'brazilian', en: 'english' }

export interface Hero {
  id: number
  name: string // no idioma escolhido
  portugueseName: string // tradução oficial do jogo
  englishName: string
  class_name: string
  player_selectable: boolean
  disabled: boolean
  hero_type?: string
  complexity?: number
  abilityClasses: string[] // as 4 habilidades, na ordem do jogo
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
  components: number[] // itens que este consome ao ser comprado (é uma melhoria deles)
}

export interface Ability {
  id: number
  name: string
  image: string
}

export interface BuildCategory {
  name: string
  position?: number // posição original na build, para chamar de "Grupo N" os grupos sem nome
  description: string
  itemIds: number[]
}

export interface Build {
  id: number
  name: string
  description: string
  weeklyFavorites: number | null // null = a API não informou (não é zero)
  favorites: number | null
  categories: BuildCategory[]
  abilityOrder: number[] // ordem das habilidades do autor (ver abilities.ts); vazia se não informou
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

const pending = new Map<string, Promise<unknown>>()

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const running = pending.get(key)
  if (running) return running as Promise<T>
  const promise = readOrLoad(key, load).finally(() => pending.delete(key))
  pending.set(key, promise)
  return promise
}

async function readOrLoad<T>(key: string, load: () => Promise<T>): Promise<T> {
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
    throw new Error(
      tr(
        'A API de dados está ocupada agora. Tente de novo em alguns segundos.',
        'The data API is busy right now. Try again in a few seconds.',
      ),
    )
  if (!res.ok) throw new Error(tr(`API respondeu ${res.status} em ${path}`, `API returned ${res.status} for ${path}`))
  return (await res.json()) as T
}

// ---------- heróis ----------

// Para a busca: ignora acentos e maiúsculas ("dinamo" acha "Dínamo")
export const normalize = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

// Os nomes vêm da tradução oficial do jogo (pt-BR). Guardo também o nome em inglês, porque muita gente
// conhece os heróis por ele e a busca aceita os dois.
export function getHeroes(): Promise<Hero[]> {
  return cached('heroes-abilities', async () => {
    const [portuguese, english] = await Promise.all([
      fetchJson<(Hero & { items?: Record<string, string> })[]>('/v1/assets/heroes?language=brazilian'),
      fetchJson<Hero[]>('/v1/assets/heroes?language=english'),
    ])
    const englishById = new Map(english.map((h) => [h.id, h.name]))
    return portuguese
      .filter((h) => h.player_selectable && !h.disabled)
      .map(
        (h): Hero => ({
          // só os campos usados: a resposta completa é grande demais para o cache do navegador
          id: h.id,
          name: h.name,
          portugueseName: h.name,
          englishName: englishById.get(h.id) ?? h.name,
          class_name: h.class_name,
          player_selectable: h.player_selectable,
          disabled: h.disabled,
          hero_type: h.hero_type,
          complexity: h.complexity,
          abilityClasses: [1, 2, 3, 4].map((n) => h.items?.[`signature${n}`]).filter((c): c is string => !!c),
          images: {
            icon_hero_card_webp: h.images.icon_hero_card_webp,
            icon_image_small_webp: h.images.icon_image_small_webp,
          },
        }),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  })
}

// ---------- itens (versão enxuta: o original pesa ~6,5 MB) ----------

interface RawItem {
  type: string
  id: number
  name: string
  class_name: string
  component_items?: string[] | null
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

interface GameData {
  items: Record<number, Item>
  abilities: Record<string, Ability> // pela class_name
}

export const getItems = (lang: Lang) => getGameData(lang).then((d) => d.items)
export const getAbilities = (lang: Lang) => getGameData(lang).then((d) => d.abilities)

function getGameData(lang: Lang): Promise<GameData> {
  return cached(`game:${lang}`, async () => {
    const raw = await fetchJson<RawItem[]>(`/v1/assets/items?language=${API_LANGUAGE[lang]}`)
    const out: Record<number, Item> = {}
    const abilities: Record<string, Ability> = {}
    const idByClass = new Map(raw.map((r) => [r.class_name, r.id]))
    for (const r of raw) {
      if (r.type === 'ability') abilities[r.class_name] = { id: r.id, name: r.name, image: r.image_webp ?? r.image ?? '' }
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
        components: (r.component_items ?? []).map((c) => idByClass.get(c)).filter((id): id is number => id !== undefined),
      }
    }
    return { items: out, abilities }
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
      ability_order?: { currency_changes?: { ability_id: number; delta: number }[] | null } | null
      mod_categories: {
        name: string
        description: string | null
        mods: { ability_id: number }[] | null // grupos só com texto vêm sem lista
      }[]
    }
  }
}

// A API usa chaves internas do jogo (#Citadel_HeroBuilds_EarlyGame, _Early, ...)
// O cache guarda o nome original; o rótulo é escolhido na hora, no idioma atual.
function categoryLabel(raw: string, index: number): string {
  const name = raw.trim()
  const m = name.match(/^#Citadel_HeroBuilds_(Early|Mid|Late)/i)
  if (m) {
    const phase = m[1].toLowerCase()
    if (phase === 'early') return tr('Início do jogo', 'Early game')
    return phase === 'mid' ? tr('Meio do jogo', 'Mid game') : tr('Fim do jogo', 'Late game')
  }
  // vazio ou abreviação sem sentido (ex.: "lr", "o")
  if (name.length <= 2 || name.startsWith('#')) return `${tr('Grupo', 'Group')} ${index + 1}`
  return name
}

// Descrições muito curtas ("lr", ".") ou iguais ao nome do grupo só poluem a tela
function usefulText(text: string | null, ...others: string[]): string {
  const t = (text ?? '').trim()
  if (t.length <= 3) return ''
  if (others.some((o) => o.trim().toLowerCase() === t.toLowerCase())) return ''
  return t
}

function authorAbilityOrder(r: RawBuild): number[] {
  const used = new Map<number, number>()
  const steps: number[] = []
  for (const change of r.hero_build.details.ability_order?.currency_changes ?? []) {
    const count = used.get(change.ability_id) ?? 0
    if (change.delta > 0) {
      // o autor devolveu o ponto: desfaz o último gasto nessa habilidade
      const last = steps.lastIndexOf(change.ability_id)
      if (last !== -1) {
        steps.splice(last, 1)
        used.set(change.ability_id, count - 1)
      }
      continue
    }
    // passou do máximo: a lista recomeçou ou está quebrada, e o que vem depois não é confiável
    if (count >= MAX_PER_ABILITY) break
    used.set(change.ability_id, count + 1)
    steps.push(change.ability_id)
  }
  return steps
}

function toBuild(r: RawBuild): Build {
  const cats = r.hero_build.details.mod_categories
  return {
    id: r.hero_build.hero_build_id,
    name: r.hero_build.name,
    description: usefulText(r.hero_build.description, ...cats.map((c) => c.name)),
    abilityOrder: authorAbilityOrder(r),
    weeklyFavorites: r.num_weekly_favorites,
    favorites: r.num_favorites,
    categories: cats
      .map((c, i) => ({
        name: c.name,
        position: i,
        description: usefulText(c.description, c.name),
        itemIds: (c.mods ?? []).map((m) => m.ability_id),
      }))
      .filter((c) => c.itemIds.length > 0),
  }
}

// Mostra só os números que a API informou
export function popularity(build: Build): string {
  const parts: string[] = []
  if (build.favorites) parts.push(`${num(build.favorites)} ${tr('favoritos', 'favorites')}`)
  if (build.weeklyFavorites) parts.push(`${num(build.weeklyFavorites)} ${tr('favoritos na semana', 'favorites this week')}`)
  return parts.join(' · ') || tr('sem número de favoritos', 'no favorite count')
}

export function localizeBuild(build: Build): Build {
  return {
    ...build,
    categories: build.categories.map((c, i) => {
      const name = categoryLabel(c.name, c.position ?? i)
      return { ...c, name, description: usefulText(c.description, name) }
    }),
  }
}

export function getBuilds(heroId: number): Promise<Build[]> {
  return cached(`builds4:${heroId}`, async () => {
    // Heróis novos não têm favoritos semanais, então busco as duas listas e junto.
    const base = `/v1/builds?hero_id=${heroId}&language=0&only_latest=true&sort_direction=desc&limit=15`
    const [weekly, total] = await Promise.all([
      fetchJson<RawBuild[]>(`${base}&sort_by=weekly_favorites`),
      fetchJson<RawBuild[]>(`${base}&sort_by=favorites`),
    ])
    const byId = new Map<number, Build>()
    for (const r of [...weekly, ...total]) {
      const b = toBuild(r)
      if (b.categories.length === 0) continue
      const seen = byId.get(b.id)
      if (!seen) byId.set(b.id, b)
      else {
        // a mesma build veio nas duas listas: junta os números
        seen.favorites ??= b.favorites
        seen.weeklyFavorites ??= b.weeklyFavorites
      }
    }
    const all = [...byId.values()].sort(
      (a, b) => (b.weeklyFavorites ?? 0) - (a.weeklyFavorites ?? 0) || (b.favorites ?? 0) - (a.favorites ?? 0),
    )
    // builds que ninguém favoritou costumam ser rascunhos; só as escondo se sobrar alguma boa
    const liked = all.filter((b) => (b.weeklyFavorites ?? 0) > 0 || (b.favorites ?? 0) > 0)
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

// A resposta tem milhares de sequências; guardo só a ordem calculada
export function getAbilityOrder(heroId: number): Promise<PopularOrder> {
  return cached(`abilityorder:${heroId}`, async () =>
    popularOrder(await fetchJson<OrderRow[]>(`/v1/analytics/ability-order-stats?hero_id=${heroId}`)),
  )
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
  return cached(`order:${getLang()}:${hero.id}:${build.id}`, async () => {
    const statById = new Map(stats.map((s) => [s.itemId, s]))
    const body = {
      language: getLang(),
      heroName: hero.name,
      buildName: build.name,
      buildDescription: build.description,
      categories: build.categories.map((c) => ({
        name: c.name,
        description: c.description,
        items: c.itemIds
          .filter((id) => items[id]?.shopable)
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
            ? tr(
                'Servidor da IA fora do ar. Rode "npm run server" em outro terminal.',
                'The AI server is offline. Run "npm run server" in another terminal.',
              )
            : `${tr('Erro', 'Error')} ${res.status}`),
      )
    }
    return data
  })
}

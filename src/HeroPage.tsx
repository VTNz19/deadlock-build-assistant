import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import {
  getBuildOrder,
  getBuilds,
  getItemStats,
  getItems,
  type Build,
  type BuildOrder,
  type Hero,
  type Item,
  type ItemStat,
} from './api'
import CountersTab from './CountersTab'
import { computeOrder, formatTime } from './order'
import { ItemChip, OrderLedger, SLOT, pct, souls, useAsync } from './ui'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

// ---------- builds ----------

function BuildDetail({
  hero,
  build,
  items,
  stats,
  aiReady,
}: {
  hero: Hero
  build: Build
  items: Record<number, Item>
  stats: ItemStat[]
  aiReady: boolean
}) {
  const [view, setView] = useState<'order' | 'author'>('order')
  const [ai, setAi] = useState<{ loading: boolean; error: string | null; order: BuildOrder | null }>({
    loading: false,
    error: null,
    order: null,
  })

  const order = useMemo(() => computeOrder(build, items, stats), [build, items, stats])

  async function runAi() {
    setAi({ loading: true, error: null, order: null })
    try {
      setAi({ loading: false, error: null, order: await getBuildOrder(hero, build, items, stats) })
    } catch (e) {
      setAi({ loading: false, error: (e as Error).message, order: null })
    }
  }

  const total = build.categories.reduce((sum, c) => sum + c.itemIds.reduce((s, id) => s + (items[id]?.cost ?? 0), 0), 0)

  return (
    <section className="min-w-0">
      <h3 className="text-2xl break-words">{build.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {build.favorites.toLocaleString('pt-BR')} favoritos
        {build.weeklyFavorites > 0 && ` · ${build.weeklyFavorites.toLocaleString('pt-BR')} na semana`} · custo listado{' '}
        <span className="text-soul tabular-nums">{souls(total)} almas</span>
      </p>

      {build.description && (
        <details className="group mt-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer text-foreground marker:text-primary">Notas do autor</summary>
          <p className="mt-2 max-h-48 max-w-prose overflow-auto whitespace-pre-line">{build.description}</p>
        </details>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={view}
          onValueChange={(v) => v && setView(v as 'order' | 'author')}
          aria-label="Modo de exibição"
        >
          <ToggleGroupItem value="order" className="data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            Ordem de compra
          </ToggleGroupItem>
          <ToggleGroupItem value="author" className="data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            Como o autor montou
          </ToggleGroupItem>
        </ToggleGroup>

        {view === 'order' && aiReady && !ai.order && (
          <Button variant="outline" onClick={runAi} disabled={ai.loading}>
            <Sparkles />
            {ai.loading ? 'A IA está ordenando...' : 'Refinar com IA'}
          </Button>
        )}
        {view === 'order' && ai.order && (
          <Button variant="ghost" onClick={() => setAi({ loading: false, error: null, order: null })}>
            Voltar à ordem por dados
          </Button>
        )}
      </div>
      {ai.error && <p className="mt-3 text-sm text-destructive">{ai.error}</p>}

      <div className="mt-5">
        {view === 'order' ? (
          <>
            <p className="mb-3 max-w-prose text-sm text-muted-foreground">
              {ai.order
                ? `${ai.order.summary} Gerado por IA (${ai.order.model}): é uma sugestão, confira antes de seguir.`
                : `${order.summary} É uma aproximação: o melhor momento de comprar muda com o seu jogo.`}
            </p>
            <OrderLedger order={ai.order ?? order} items={items} />
          </>
        ) : (
          <div className="space-y-6">
            {build.categories.map((c, i) => (
              <div key={i}>
                <h4 className="text-lg text-primary">{c.name}</h4>
                {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-y-2">
                  {c.itemIds
                    .filter((id) => items[id])
                    .map((id, j, list) => (
                      <span key={`${id}-${j}`} className="inline-flex items-center">
                        <ItemChip item={items[id]} />
                        {j < list.length - 1 && <ChevronRight className="mx-1 size-4 text-primary" aria-hidden="true" />}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function BuildsTab({ hero, items, stats }: { hero: Hero; items: Record<number, Item>; stats: ItemStat[] }) {
  const { data: builds, error, loading } = useAsync(() => getBuilds(hero.id), [hero.id])
  const [selected, setSelected] = useState(0)
  const [aiReady, setAiReady] = useState(false)

  useEffect(() => setSelected(0), [hero.id])

  // o botão de IA só aparece se o servidor local estiver no ar com a chave configurada
  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((h: { hasKey?: boolean }) => setAiReady(Boolean(h.hasKey)))
      .catch(() => setAiReady(false))
  }, [])

  if (loading)
    return (
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]" aria-busy="true">
        <Skeleton className="h-96" />
        <Skeleton className="h-96" />
      </div>
    )
  if (error) return <p className="text-destructive">Não consegui carregar as builds: {error}</p>
  if (!builds || builds.length === 0)
    return <p className="text-muted-foreground">Ainda não há builds em inglês para este herói.</p>

  const build = builds[Math.min(selected, builds.length - 1)]

  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <ul className="flex gap-2 overflow-x-auto pb-2 lg:max-h-[75vh] lg:flex-col lg:overflow-y-auto lg:pr-1 lg:pb-0">
        {builds.map((b, i) => (
          <li key={b.id} className="shrink-0 lg:shrink">
            <button
              type="button"
              onClick={() => setSelected(i)}
              aria-current={i === selected}
              className={cn(
                'w-56 rounded-md border bg-card px-3 py-2 text-left transition-colors hover:border-primary lg:w-full',
                i === selected && 'border-primary bg-accent',
              )}
            >
              <span className="line-clamp-2 font-medium break-words">{b.name}</span>
              <span className="text-xs text-muted-foreground">{b.favorites.toLocaleString('pt-BR')} favoritos</span>
            </button>
          </li>
        ))}
      </ul>
      <BuildDetail key={`${hero.id}-${build.id}`} hero={hero} build={build} items={items} stats={stats} aiReady={aiReady} />
    </div>
  )
}

// ---------- itens mais fortes ----------

function StatsTab({ items, stats }: { items: Record<number, Item>; stats: ItemStat[] }) {
  const [sort, setSort] = useState<'winRate' | 'matches'>('winRate')
  const [slot, setSlot] = useState('all')
  const [minMatches, setMinMatches] = useState(500)

  const rows = useMemo(
    () =>
      stats
        .filter((s) => items[s.itemId]?.shopable)
        .filter((s) => slot === 'all' || items[s.itemId].slot === slot)
        .filter((s) => s.matches >= minMatches)
        .sort((a, b) => b[sort] - a[sort])
        .slice(0, 40),
    [stats, items, sort, slot, minMatches],
  )

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Ordenar por</span>
          <Select value={sort} onValueChange={(v) => setSort(v as 'winRate' | 'matches')}>
            <SelectTrigger className="w-48" aria-label="Ordenar por">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="winRate">Taxa de vitória</SelectItem>
              <SelectItem value="matches">Mais comprados</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Mínimo de partidas</span>
          <Select value={String(minMatches)} onValueChange={(v) => setMinMatches(Number(v))}>
            <SelectTrigger className="w-36" aria-label="Mínimo de partidas">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[50, 200, 500, 1000, 5000].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {souls(n)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ToggleGroup type="single" variant="outline" value={slot} onValueChange={(v) => setSlot(v || 'all')} aria-label="Tipo de item">
          <ToggleGroupItem value="all">Todos</ToggleGroupItem>
          {Object.entries(SLOT).map(([k, v]) => (
            <ToggleGroupItem key={k} value={k}>
              {v.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">Nenhum item com esses filtros. Reduza o mínimo de partidas.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="border-b bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 font-medium">Taxa de vitória</th>
                <th className="px-4 py-2.5 text-right font-medium">Partidas</th>
                <th className="px-4 py-2.5 text-right font-medium">Compra média</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.itemId} className="border-b last:border-0">
                  <td className="px-4 py-2">
                    <ItemChip item={items[r.itemId]} />
                  </td>
                  <td className="px-4 py-2">
                    <span className="flex items-center gap-3">
                      <span className={cn('w-14 tabular-nums', r.winRate >= 0.5 ? 'text-good' : 'text-destructive')}>
                        {pct(r.winRate)}
                      </span>
                      <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-muted sm:block" aria-hidden="true">
                        <span
                          className={cn('block h-full', r.winRate >= 0.5 ? 'bg-good' : 'bg-destructive')}
                          style={{ width: `${Math.max(4, Math.min(100, ((r.winRate - 0.4) / 0.2) * 100))}%` }}
                        />
                      </span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{souls(r.matches)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatTime(r.avgBuyTimeS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        Taxa de vitória não prova que o item é bom: quem ganha mais também compra mais itens caros.
      </p>
    </div>
  )
}

// ---------- página ----------

export default function HeroPage({ hero }: { hero: Hero }) {
  const { data: items, error: itemsError } = useAsync(getItems, [])
  const { data: stats, error: statsError } = useAsync(() => getItemStats(hero.id), [hero.id])
  const error = itemsError ?? statsError
  const ready = items && stats

  // a aba ativa fica no link (#/hero/77?tab=counters), assim dá para compartilhar
  const [tab, setTab] = useState(() => {
    const t = new URLSearchParams(window.location.hash.split('?')[1] ?? '').get('tab')
    return t === 'stats' || t === 'counters' ? t : 'builds'
  })
  function changeTab(value: string) {
    setTab(value)
    window.history.replaceState(null, '', `#/hero/${hero.id}${value === 'builds' ? '' : `?tab=${value}`}`)
  }

  return (
    <div>
      <a href="#/" className="mb-5 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" />
        Todos os heróis
      </a>

      <div className="mb-8 flex items-end gap-5">
        {hero.images.icon_hero_card_webp && (
          <img
            src={hero.images.icon_hero_card_webp}
            alt=""
            className="h-32 w-24 shrink-0 rounded-md border object-cover"
          />
        )}
        <div>
          <h1 className="text-4xl sm:text-6xl">{hero.name}</h1>
          {hero.hero_type && (
            <Badge variant="outline" className="mt-3 capitalize">
              {hero.hero_type}
            </Badge>
          )}
        </div>
      </div>

      {error && <p className="text-destructive">Não consegui carregar os dados: {error}</p>}
      {!ready && !error && <Skeleton className="h-96" aria-busy="true" />}

      {ready && (
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList variant="line" className="mb-6 h-auto w-full justify-start overflow-x-auto border-b sm:w-fit">
            <TabsTrigger value="builds">Builds da comunidade</TabsTrigger>
            <TabsTrigger value="stats">Itens mais fortes</TabsTrigger>
            <TabsTrigger value="counters">Contra o inimigo</TabsTrigger>
          </TabsList>
          <TabsContent value="builds">
            <BuildsTab hero={hero} items={items} stats={stats} />
          </TabsContent>
          <TabsContent value="stats">
            <StatsTab items={items} stats={stats} />
          </TabsContent>
          <TabsContent value="counters">
            <CountersTab hero={hero} items={items} stats={stats} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react'
import {
  getBuildOrder,
  getBuilds,
  getItemStats,
  localizeBuild,
  popularity,
  type Build,
  type BuildOrder,
  type Hero,
  type Item,
  type ItemStat,
  type Lang,
} from './api'
import CountersTab from './CountersTab'
import { classLabel, getLang, num, pct, tr, tx } from './i18n'
import { useItems } from './lang'
import { computeOrder, formatTime } from './order'
import { fewestMissingFirst, isBuyable, purchases, totalCost, unavailableItems } from './shop'
import { GoneItem, ItemChip, OrderLedger, SLOT, useAsync } from './ui'
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
  const [ai, setAi] = useState<{ loading: boolean; error: string | null; order: BuildOrder | null; lang?: Lang }>({
    loading: false,
    error: null,
    order: null,
  })
  const aiOrder = ai.lang === getLang() ? ai.order : null

  const order = useMemo(() => computeOrder(build, items, stats), [build, items, stats])

  async function runAi() {
    const lang = getLang()
    setAi({ loading: true, error: null, order: null })
    try {
      setAi({ loading: false, error: null, order: await getBuildOrder(hero, build, items, stats), lang })
    } catch (e) {
      setAi({ loading: false, error: (e as Error).message, order: null })
    }
  }

  const total = totalCost(purchases((aiOrder ?? order).steps.map((s) => s.itemId), items))
  const gone = unavailableItems(build.categories.flatMap((c) => c.itemIds), items)

  return (
    <section className="min-w-0">
      <h3 className="text-2xl break-words">{build.name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        {popularity(build)} · {tr('custo total', 'total cost')}{' '}
        <span className="text-soul tabular-nums">
          {num(total)} {tr('almas', 'souls')}
        </span>
      </p>

      {gone.count > 0 && (
        <p className="mt-3 max-w-prose rounded-md border-l-2 border-destructive bg-card px-4 py-2.5 text-sm">
          {tr(
            `Esta build está desatualizada: ${gone.count} ${gone.count > 1 ? 'itens dela não estão mais na loja e foram retirados' : 'item dela não está mais na loja e foi retirado'}`,
            `This build is outdated: ${gone.count} ${gone.count > 1 ? 'of its items are no longer in the shop and were removed' : 'of its items is no longer in the shop and was removed'}`,
          )}
          {gone.names.length > 0 && ` (${gone.names.join(', ')})`}.
        </p>
      )}

      {build.description && (
        <details className="group mt-3 text-sm text-muted-foreground">
          <summary className="cursor-pointer text-foreground marker:text-primary">{tr('Notas do autor', "Author's notes")}</summary>
          <p className="mt-2 max-h-48 max-w-prose overflow-auto whitespace-pre-line">{build.description}</p>
        </details>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={view}
          onValueChange={(v) => v && setView(v as 'order' | 'author')}
          aria-label={tr('Modo de exibição', 'View mode')}
        >
          <ToggleGroupItem value="order" className="data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            {tr('Ordem de compra', 'Purchase order')}
          </ToggleGroupItem>
          <ToggleGroupItem value="author" className="data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
            {tr('Como o autor montou', "Author's layout")}
          </ToggleGroupItem>
        </ToggleGroup>

        {view === 'order' && aiReady && !aiOrder && (
          <Button variant="outline" onClick={runAi} disabled={ai.loading}>
            <Sparkles />
            {ai.loading ? tr('A IA está ordenando...', 'AI is ordering...') : tr('Refinar com IA', 'Refine with AI')}
          </Button>
        )}
        {view === 'order' && aiOrder && (
          <Button variant="ghost" onClick={() => setAi({ loading: false, error: null, order: null })}>
            {tr('Voltar à ordem por dados', 'Back to the data-based order')}
          </Button>
        )}
      </div>
      {ai.error && <p className="mt-3 text-sm text-destructive">{ai.error}</p>}

      <div className="mt-5">
        {view === 'order' ? (
          <>
            <p className="mb-3 max-w-prose text-sm text-muted-foreground">
              {aiOrder
                ? `${aiOrder.summary} ${tr(
                    `Gerado por IA (${aiOrder.model}): é uma sugestão, confira antes de seguir.`,
                    `Generated by AI (${aiOrder.model}): it's a suggestion, check it before following.`,
                  )}`
                : `${order.summary} ${tr(
                    'É uma aproximação: o melhor momento de comprar muda com o seu jogo.',
                    "It's an approximation: the best time to buy changes with your game.",
                  )}`}
            </p>
            <OrderLedger order={aiOrder ?? order} items={items} gone={gone.ids} />
          </>
        ) : (
          <div className="space-y-6">
            {build.categories.map((c, i) => (
              <div key={i}>
                <h4 className="text-lg text-primary">{c.name}</h4>
                {c.description && <p className="text-sm text-muted-foreground">{c.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-y-2">
                  {c.itemIds.map((id, j, list) => (
                      <span key={`${id}-${j}`} className="inline-flex items-center">
                        {isBuyable(items, id) ? <ItemChip item={items[id]} /> : <GoneItem item={items[id]} />}
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
  const { data: rawBuilds, error, loading } = useAsync(() => getBuilds(hero.id), [hero.id])
  const lang = getLang()
  const builds = useMemo(() => rawBuilds && fewestMissingFirst(rawBuilds.map(localizeBuild), items), [rawBuilds, items, lang])
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
  if (error)
    return (
      <p className="text-destructive">
        {tr('Não consegui carregar as builds:', "Couldn't load the builds:")} {error}
      </p>
    )
  if (!builds || builds.length === 0)
    return (
      <p className="text-muted-foreground">
        {tr('Ainda não há builds em inglês para este herói.', 'There are no English builds for this hero yet.')}
      </p>
    )

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
              <span className="text-xs text-muted-foreground">{popularity(b)}</span>
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
          <span className="text-xs text-muted-foreground">{tr('Ordenar por', 'Sort by')}</span>
          <Select value={sort} onValueChange={(v) => setSort(v as 'winRate' | 'matches')}>
            <SelectTrigger className="w-48" aria-label={tr('Ordenar por', 'Sort by')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="winRate">{tr('Taxa de vitória', 'Win rate')}</SelectItem>
              <SelectItem value="matches">{tr('Mais comprados', 'Most bought')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">{tr('Mínimo de partidas', 'Minimum matches')}</span>
          <Select value={String(minMatches)} onValueChange={(v) => setMinMatches(Number(v))}>
            <SelectTrigger className="w-36" aria-label={tr('Mínimo de partidas', 'Minimum matches')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[50, 200, 500, 1000, 5000].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {num(n)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ToggleGroup type="single" variant="outline" value={slot} onValueChange={(v) => setSlot(v || 'all')} aria-label={tr('Tipo de item', 'Item type')}>
          <ToggleGroupItem value="all">{tr('Todos', 'All')}</ToggleGroupItem>
          {Object.entries(SLOT).map(([k, v]) => (
            <ToggleGroupItem key={k} value={k}>
              {tx(v.label)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground">
          {tr('Nenhum item com esses filtros. Reduza o mínimo de partidas.', 'No items match these filters. Lower the minimum matches.')}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full min-w-[34rem] text-sm">
            <thead className="border-b bg-muted text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Item</th>
                <th className="px-4 py-2.5 font-medium">{tr('Taxa de vitória', 'Win rate')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{tr('Partidas', 'Matches')}</th>
                <th className="px-4 py-2.5 text-right font-medium">{tr('Compra média', 'Avg. buy time')}</th>
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
                  <td className="px-4 py-2 text-right tabular-nums">{num(r.matches)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatTime(r.avgBuyTimeS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-sm text-muted-foreground">
        {tr(
          'Taxa de vitória não prova que o item é bom: quem ganha mais também compra mais itens caros.',
          "Win rate doesn't prove an item is good: players who are winning also buy more expensive items.",
        )}
      </p>
    </div>
  )
}

// ---------- página ----------

export default function HeroPage({ hero, heroes, lang }: { hero: Hero; heroes: Hero[]; lang: Lang }) {
  const { data: items, error: itemsError } = useItems(lang)
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
        {tr('Todos os heróis', 'All heroes')}
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
            <Badge variant="outline" className="mt-3">
              {classLabel(hero.hero_type)}
            </Badge>
          )}
        </div>
      </div>

      {error && <p className="text-destructive">
          {tr('Não consegui carregar os dados:', "Couldn't load the data:")} {error}
        </p>}
      {!ready && !error && <Skeleton className="h-96" aria-busy="true" />}

      {ready && (
        <Tabs value={tab} onValueChange={changeTab}>
          <TabsList variant="line" className="mb-6 h-auto w-full justify-start overflow-x-auto border-b sm:w-fit">
            <TabsTrigger value="builds">{tr('Builds da comunidade', 'Community builds')}</TabsTrigger>
            <TabsTrigger value="stats">{tr('Itens mais fortes', 'Strongest items')}</TabsTrigger>
            <TabsTrigger value="counters">{tr('Contra o inimigo', 'Against the enemy')}</TabsTrigger>
          </TabsList>
          <TabsContent value="builds">
            <BuildsTab hero={hero} items={items} stats={stats} />
          </TabsContent>
          <TabsContent value="stats">
            <StatsTab items={items} stats={stats} />
          </TabsContent>
          <TabsContent value="counters">
            <CountersTab hero={hero} heroes={heroes} items={items} stats={stats} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  )
}

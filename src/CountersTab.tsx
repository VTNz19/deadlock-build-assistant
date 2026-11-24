import { useMemo, useState } from 'react'
import { getEnemyItemStats, getHeroes, type Hero, type Item, type ItemStat } from './api'
import { THREATS, findCounters, type CounterItem, type ThreatId } from './counters'
import { computeMatchup, type MatchupRow } from './matchup'
import { ItemChip, pct, pp, souls, useAsync } from './ui'
import { HeroCombobox } from '@/components/HeroCombobox'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

// ---------- Contra o quê? (tipo de ameaça) ----------

function ThreatSection({ items, stats }: { items: Record<number, Item>; stats: ItemStat[] }) {
  const [threatId, setThreatId] = useState<ThreatId | null>(null)
  const [sort, setSort] = useState<'strength' | 'winRate' | 'cost'>('strength')

  const statById = useMemo(() => new Map(stats.map((s) => [s.itemId, s])), [stats])
  const threat = THREATS.find((t) => t.id === threatId)

  const list = useMemo<CounterItem[]>(() => {
    if (!threat) return []
    return findCounters(threat, items, statById).sort((a, b) => {
      if (sort === 'cost') return a.item.cost - b.item.cost || b.strength - a.strength
      if (sort === 'winRate') {
        const wa = a.stat && a.stat.matches >= 200 ? a.stat.winRate : -1
        const wb = b.stat && b.stat.matches >= 200 ? b.stat.winRate : -1
        return wb - wa || b.strength - a.strength
      }
      return b.strength - a.strength || a.item.cost - b.item.cost
    })
  }, [threat, items, statById, sort])

  return (
    <section>
      <h2 className="text-2xl">O que está te incomodando?</h2>
      <p className="mt-1 text-muted-foreground">Escolha e veja os itens que resolvem.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {THREATS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-pressed={t.id === threatId}
            onClick={() => setThreatId(t.id)}
            className={cn(
              'flex flex-col items-start justify-start rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary',
              t.id === threatId && 'border-primary bg-accent',
            )}
          >
            <span className="block font-heading text-lg leading-tight">{t.label}</span>
            <span className="mt-1 block text-sm text-muted-foreground">{t.hint}</span>
          </button>
        ))}
      </div>

      {threat && (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">
              {list.length} itens. Alguns efeitos são condicionais (ativos, ou só com pouca vida): leia a descrição.
            </p>
            <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
              <SelectTrigger className="w-64" aria-label="Ordenar por">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="strength">Efeito mais forte</SelectItem>
                <SelectItem value="winRate">Taxa de vitória com este herói</SelectItem>
                <SelectItem value="cost">Mais barato</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {list.length === 0 ? (
            <p className="text-muted-foreground">Nenhum item encontrado para esta ameaça.</p>
          ) : (
            <ul className="divide-y overflow-hidden rounded-lg border bg-card">
              {list.map(({ item, effects, stat }) => (
                <li key={item.id} className="grid gap-x-4 gap-y-2 p-3 sm:grid-cols-[15rem_minmax(0,1fr)_7rem]">
                  <div>
                    <ItemChip item={item} />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{effects.join(' · ')}</p>
                    {item.desc && <p className="mt-0.5 text-sm text-muted-foreground">{item.desc}</p>}
                  </div>
                  <div className="text-sm sm:text-right">
                    {stat && stat.matches >= 200 ? (
                      <>
                        <span className={cn('block tabular-nums', stat.winRate >= 0.5 ? 'text-good' : 'text-destructive')}>
                          {pct(stat.winRate)}
                        </span>
                        <span className="text-xs text-muted-foreground">{souls(stat.matches)} partidas</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">poucos dados</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

// ---------- Contra quem? (herói inimigo) ----------

function MatchupTable({ rows }: { rows: MatchupRow[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full min-w-[34rem] text-sm">
        <thead className="border-b bg-muted text-left text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-medium">Item</th>
            <th className="px-4 py-2.5 font-medium">Diferença</th>
            <th className="px-4 py-2.5 text-right font-medium">Contra ele</th>
            <th
              className="px-4 py-2.5 text-right font-medium"
              title="Taxa geral do item mais o efeito do confronto"
            >
              Esperado
            </th>
            <th className="px-4 py-2.5 text-right font-medium">Partidas</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.item.id} className="border-b last:border-0">
              <td className="px-4 py-2">
                <ItemChip item={r.item} />
              </td>
              <td className="px-4 py-2">
                <span className={cn('tabular-nums', r.delta >= 0 ? 'text-good' : 'text-destructive')}>{pp(r.delta)}</span>
                {r.reliable && (
                  <Badge variant="outline" className="ml-2 text-good" title="A diferença é maior do que o ruído esperado para essa amostra">
                    confiável
                  </Badge>
                )}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">{pct(r.vs.winRate)}</td>
              <td className="px-4 py-2 text-right text-muted-foreground tabular-nums">{pct(r.expected)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{souls(r.vs.matches)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EnemySection({
  hero,
  items,
  stats,
  heroes,
}: {
  hero: Hero
  items: Record<number, Item>
  stats: ItemStat[]
  heroes: Hero[]
}) {
  const [enemyId, setEnemyId] = useState<number | null>(null)
  const [minMatches, setMinMatches] = useState(200)

  const { data: vsStats, error, loading } = useAsync<ItemStat[] | null>(
    () => (enemyId === null ? Promise.resolve(null) : getEnemyItemStats(hero.id, enemyId)),
    [hero.id, enemyId],
  )

  const { rows, shift } = useMemo(
    () => computeMatchup(items, stats, vsStats, minMatches),
    [vsStats, stats, items, minMatches],
  )

  const best = rows.filter((r) => r.delta > 0).slice(0, 12)
  const worst = rows.filter((r) => r.delta < 0).slice(-6).reverse()
  const enemy = heroes.find((h) => h.id === enemyId)

  return (
    <section>
      <h2 className="text-2xl">Contra quem?</h2>
      <p className="mt-1 max-w-prose text-muted-foreground">
        Escolha o herói inimigo e veja quais itens do {hero.name} vão melhor ou pior contra ele.
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <div className="grid w-64 gap-1.5">
          <span className="text-xs text-muted-foreground">Herói inimigo</span>
          <HeroCombobox heroes={heroes} value={enemyId} placeholder="Escolher herói" onSelect={setEnemyId} />
        </div>
        <div className="grid gap-1.5">
          <span className="text-xs text-muted-foreground">Mínimo de partidas</span>
          <Select value={String(minMatches)} onValueChange={(v) => setMinMatches(Number(v))}>
            <SelectTrigger className="w-36" aria-label="Mínimo de partidas">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[50, 200, 500, 1000].map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {souls(n)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {enemyId !== null && loading && <Skeleton className="mt-6 h-48" aria-busy="true" />}
      {error && <p className="mt-4 text-destructive">{error}</p>}
      {enemyId !== null && !loading && !error && rows.length === 0 && (
        <p className="mt-4 text-muted-foreground">Poucas partidas deste confronto. Reduza o mínimo de partidas.</p>
      )}

      {rows.length > 0 && Math.abs(shift) >= 0.01 && (
        <p className="mt-6 max-w-prose rounded-md border-l-2 border-primary bg-card px-4 py-3 text-sm">
          Contra {enemy?.name}, o {hero.name} costuma render{' '}
          <strong>
            {(Math.abs(shift) * 100).toFixed(1).replace('.', ',')} p.p. {shift < 0 ? 'a menos' : 'a mais'}
          </strong>{' '}
          em geral. Isso afeta todos os itens, então cada um é comparado com esse nível: o que importa é quem se destaca
          dentro do confronto.
        </p>
      )}

      {best.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-xl text-good">Funcionam melhor contra {enemy?.name}</h3>
          <MatchupTable rows={best} />
        </div>
      )}
      {worst.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-xl text-destructive">Funcionam pior contra {enemy?.name}</h3>
          <MatchupTable rows={worst} />
        </div>
      )}
      {rows.length > 0 && (
        <p className="mt-4 max-w-prose text-sm text-muted-foreground">
          p.p. = pontos percentuais. Isto mostra correlação, não causa: quem compra um item contra um herói pode já estar
          ganhando ou perdendo. Prefira os itens confiáveis e com muitas partidas.
        </p>
      )}
    </section>
  )
}

// ---------- aba ----------

export default function CountersTab({
  hero,
  items,
  stats,
}: {
  hero: Hero
  items: Record<number, Item>
  stats: ItemStat[]
}) {
  const { data: heroes } = useAsync(getHeroes, [])

  return (
    <div className="space-y-12">
      <ThreatSection items={items} stats={stats} />
      {heroes ? <EnemySection hero={hero} items={items} stats={stats} heroes={heroes} /> : <Skeleton className="h-32" />}
    </div>
  )
}

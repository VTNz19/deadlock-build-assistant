import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import { getBuilds, getItems, type Hero } from './api'
import { loadComp, makePlan, pickDefaultBuild, summarizeEnemies, teamNotes, type CompData } from './comp'
import { OrderLedger, pp, useAsync } from './ui'
import { HeroAvatar, HeroCombobox } from '@/components/HeroCombobox'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'

const MAX_ALLIES = 5
const MAX_ENEMIES = 6

// ---------- estado na URL (dá para compartilhar o link da composição) ----------

function readHash() {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '')
  const list = (k: string) =>
    (params.get(k) ?? '')
      .split(',')
      .filter(Boolean)
      .map(Number)
      .filter((n) => Number.isFinite(n))
  const meRaw = params.get('me')
  return { me: meRaw && Number.isFinite(Number(meRaw)) ? Number(meRaw) : null, allies: list('a'), enemies: list('e') }
}

function writeHash(me: number | null, allies: number[], enemies: number[]) {
  const p = new URLSearchParams()
  if (me !== null) p.set('me', String(me))
  if (allies.length) p.set('a', allies.join(','))
  if (enemies.length) p.set('e', enemies.join(','))
  const q = p.toString()
  window.history.replaceState(null, '', `#/comp${q ? `?${q}` : ''}`)
}

// ---------- seleção ----------

function TeamPicker({
  title,
  heroes,
  ids,
  max,
  exclude,
  onChange,
}: {
  title: string
  heroes: Hero[]
  ids: number[]
  max: number
  exclude: number[]
  onChange: (ids: number[]) => void
}) {
  const available = heroes.filter((h) => !ids.includes(h.id) && !exclude.includes(h.id))
  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 flex items-baseline justify-between text-lg">
        {title}
        <span className="font-sans text-sm text-muted-foreground tabular-nums">
          {ids.length}/{max}
        </span>
      </h3>
      <ul className="mb-3 flex min-h-8 flex-wrap gap-2">
        {ids.map((id) => {
          const h = heroes.find((x) => x.id === id)
          if (!h) return null
          return (
            <li key={id} className="inline-flex items-center gap-1.5 rounded-full border bg-background py-0.5 pr-1 pl-0.5 text-sm">
              <HeroAvatar hero={h} className="size-6" />
              {h.name}
              <button
                type="button"
                aria-label={`Remover ${h.name}`}
                onClick={() => onChange(ids.filter((x) => x !== id))}
                className="grid size-5 place-items-center rounded-full text-muted-foreground hover:bg-destructive hover:text-background"
              >
                <X className="size-3" />
              </button>
            </li>
          )
        })}
        {ids.length === 0 && <li className="text-sm text-muted-foreground">Nenhum herói ainda.</li>}
      </ul>
      {ids.length < max && (
        <HeroCombobox
          heroes={available}
          placeholder="Adicionar herói"
          onSelect={(id) => onChange([...ids, id])}
        />
      )}
    </div>
  )
}

// ---------- resultado ----------

function EnemyOverview({ comp, summary }: { comp: CompData; summary: ReturnType<typeof summarizeEnemies> }) {
  return (
    <section>
      <h2 className="text-2xl">Time inimigo</h2>

      <ul className="mt-4 divide-y overflow-hidden rounded-lg border bg-card">
        {comp.enemies.map((e) => {
          const sp = e.spiritShare === null ? null : Math.round(e.spiritShare * 100)
          return (
            <li key={e.hero.id} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 px-4 py-2.5 sm:grid-cols-[auto_9rem_1fr_14rem]">
              <HeroAvatar hero={e.hero} />
              <span>
                <span className="font-medium">{e.hero.name}</span>
                <span className="ml-2 text-xs text-muted-foreground capitalize">{e.hero.hero_type}</span>
              </span>
              {sp !== null ? (
                <>
                  <span
                    className="col-span-2 h-2 overflow-hidden rounded-full bg-weapon sm:col-span-1"
                    role="img"
                    aria-label={`${sp}% habilidade, ${100 - sp}% disparo`}
                  >
                    <span className="block h-full bg-spirit" style={{ width: `${sp}%` }} />
                  </span>
                  <span className="col-span-2 text-sm text-muted-foreground tabular-nums sm:col-span-1 sm:text-right">
                    <span className="text-spirit">habilidade {sp}%</span> · <span className="text-weapon">disparo {100 - sp}%</span>
                  </span>
                </>
              ) : (
                <span className="col-span-2 text-sm text-muted-foreground sm:col-span-2">sem dados suficientes</span>
              )}
            </li>
          )
        })}
      </ul>

      {comp.failed.length > 0 && (
        <p className="mt-3 text-sm text-destructive">
          Sem dados de partidas para {comp.failed.join(', ')}. A análise ignora esses heróis; tente de novo em instantes.
        </p>
      )}

      {summary.threats.length > 0 ? (
        <ul className="mt-4 flex flex-wrap gap-3">
          {summary.threats.map((t) => (
            <li key={t.id} className="rounded-lg border border-primary/60 bg-card px-4 py-2.5">
              <span className="block font-heading text-lg leading-tight">{t.label}</span>
              <span className="text-sm text-muted-foreground">{t.why}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-muted-foreground">Nenhuma ameaça clara neste time.</p>
      )}
      <p className="mt-4 max-w-prose text-sm text-muted-foreground">
        O tipo de dano é uma estimativa, feita pelos itens que os jogadores de cada herói costumam comprar. "Linha de
        frente" e "curador" vêm da classe do herói no jogo.
      </p>
    </section>
  )
}

export default function CompPage({ heroes }: { heroes: Hero[] }) {
  const init = useMemo(readHash, [])
  const [me, setMe] = useState<number | null>(init.me)
  const [allies, setAllies] = useState<number[]>(init.allies)
  const [enemies, setEnemies] = useState<number[]>(init.enemies)
  const [buildChoice, setBuildChoice] = useState<number | null>(null)

  useEffect(() => writeHash(me, allies, enemies), [me, allies, enemies])
  useEffect(() => setBuildChoice(null), [me])

  const { data: items, error: itemsError } = useAsync(getItems, [])
  const byId = (id: number) => heroes.find((h) => h.id === id)
  const meHero = me !== null ? byId(me) : undefined
  const enemyHeroes = enemies.map(byId).filter((h): h is Hero => !!h)
  const allyHeroes = allies.map(byId).filter((h): h is Hero => !!h)
  const ready = !!meHero && enemyHeroes.length > 0

  const { data: comp, error: compError, loading: compLoading } = useAsync<CompData | null>(
    () => (items && meHero && enemyHeroes.length > 0 ? loadComp(meHero, enemyHeroes, items) : Promise.resolve(null)),
    [items, me, enemies.join(',')],
  )
  const { data: builds } = useAsync(() => (meHero ? getBuilds(meHero.id) : Promise.resolve([])), [me])

  const buildIdx = builds && builds.length > 0 ? Math.min(buildChoice ?? pickDefaultBuild(builds), builds.length - 1) : 0
  const summary = useMemo(() => (comp ? summarizeEnemies(comp.enemies) : null), [comp])
  const plan = useMemo(
    () => (comp && summary && items && builds && builds[buildIdx] ? makePlan(comp, summary, builds[buildIdx], items) : null),
    [comp, summary, items, builds, buildIdx],
  )
  const notes = meHero ? teamNotes(meHero, allyHeroes) : []

  function changeMe(id: number) {
    setMe(id)
    setAllies((a) => a.filter((x) => x !== id))
  }

  return (
    <div>
      <div className="mb-8 max-w-2xl">
        <h1 className="text-4xl sm:text-5xl">Montar composição</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Escolha o seu herói, o seu time e o time inimigo. Eu analiso os inimigos e monto a build para esta partida.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-lg">Meu herói</h3>
          <HeroCombobox heroes={heroes} value={me} placeholder="Escolher herói" onSelect={changeMe} />
        </div>
        <TeamPicker title="Meu time" heroes={heroes} ids={allies} max={MAX_ALLIES} exclude={me !== null ? [me] : []} onChange={setAllies} />
        <TeamPicker title="Time inimigo" heroes={heroes} ids={enemies} max={MAX_ENEMIES} exclude={[]} onChange={setEnemies} />
      </div>

      <div className="mt-10 space-y-12">
        {!ready && (
          <p className="text-muted-foreground">Escolha o seu herói e pelo menos um inimigo para ver a build.</p>
        )}
        {itemsError && <p className="text-destructive">{itemsError}</p>}
        {ready && compLoading && <Skeleton className="h-64" aria-busy="true" />}
        {compError && (
          <p className="text-destructive">
            Não consegui analisar o time: {compError} Tente de novo em instantes.
          </p>
        )}

        {ready && comp && summary && (
          <>
            <EnemyOverview comp={comp} summary={summary} />

            {notes.length > 0 && (
              <section>
                <h2 className="text-2xl">Seu time</h2>
                <ul className="mt-3 list-disc space-y-1 pl-5">
                  {notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-muted-foreground">Observações simples, baseadas só na classe dos heróis.</p>
              </section>
            )}

            <section>
              <h2 className="text-2xl">Build para esta partida: {meHero?.name}</h2>
              {builds && builds.length > 0 ? (
                <>
                  <div className="mt-4 grid w-full max-w-md gap-1.5">
                    <span className="text-xs text-muted-foreground">Build base (da comunidade)</span>
                    <Select value={String(buildIdx)} onValueChange={(v) => setBuildChoice(Number(v))}>
                      <SelectTrigger aria-label="Build base">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {builds.map((b, i) => (
                          <SelectItem key={b.id} value={String(i)}>
                            {b.name} ({b.favorites.toLocaleString('pt-BR')} favoritos)
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {plan && items && (
                    <div className="mt-5 space-y-4">
                      {plan.removed.length > 0 && (
                        <div className="rounded-md border-l-2 border-destructive bg-card px-4 py-3 text-sm">
                          <p className="font-medium">Tirados da build, porque rendem pior contra este time:</p>
                          <ul className="mt-1 list-disc pl-5">
                            {plan.removed.map((r) => (
                              <li key={r.item.id}>
                                {r.item.name} <span className="text-destructive tabular-nums">{pp(r.delta)}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {plan.picks.size === 0 && plan.removed.length === 0 && (
                        <p className="text-muted-foreground">A build base já parece boa para este time: nenhuma mudança clara.</p>
                      )}
                      <p className="max-w-prose text-sm text-muted-foreground">
                        A ordem vem da hora média em que os jogadores compram cada item. Os itens com{' '}
                        <Badge className="align-middle">Novo</Badge> entraram pelas ameaças detectadas ou porque rendem bem
                        contra este time. É uma sugestão baseada em estatística, não uma garantia.
                      </p>
                      <OrderLedger order={plan.order} items={items} badges={plan.picks} />
                    </div>
                  )}
                </>
              ) : (
                <p className="mt-3 text-muted-foreground">Ainda não há builds em inglês para este herói.</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}

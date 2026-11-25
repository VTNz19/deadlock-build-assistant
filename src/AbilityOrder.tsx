import { useState } from 'react'
import { LockOpen } from 'lucide-react'
import { getAbilityOrder, type Ability, type Hero, type Lang } from './api'
import { maxOrder, stepLevels, validAuthorOrder, type PopularOrder } from './abilities'
import { num, tr } from './i18n'
import { useAbilities } from './lang'
import { useAsync } from './ui'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'

function OrderTable({ steps, abilities }: { steps: number[]; abilities: Ability[] }) {
  const levels = stepLevels(steps)
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead className="border-b bg-muted text-muted-foreground">
          <tr>
            <th scope="col" className="sticky left-0 bg-muted px-3 py-2 text-left font-medium">
              {tr('Habilidade', 'Ability')}
            </th>
            {steps.map((_, i) => (
              <th key={i} scope="col" className="min-w-8 px-1 py-2 text-center font-medium tabular-nums">
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {abilities.map((ability) => (
            <tr key={ability.id} className="border-b last:border-0">
              <th scope="row" className="sticky left-0 bg-card px-3 py-1.5 text-left font-medium">
                <span className="flex items-center gap-2">
                  <img src={ability.image} alt="" loading="lazy" className="size-7 shrink-0 rounded-md bg-muted object-contain p-0.5" />
                  <span className="w-24 leading-tight sm:w-36">{ability.name}</span>
                </span>
              </th>
              {steps.map((id, i) => (
                <td key={i} className="px-0.5 py-1.5 text-center">
                  {id === ability.id && (
                    <span
                      className={cn(
                        'mx-auto grid size-7 place-items-center rounded-md font-semibold tabular-nums',
                        levels[i] === 0 ? 'border border-primary text-primary' : 'bg-primary text-primary-foreground',
                      )}
                    >
                      {levels[i] === 0 ? (
                        <LockOpen className="size-3.5" role="img" aria-label={tr('Desbloquear', 'Unlock')} />
                      ) : (
                        levels[i]
                      )}
                    </span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MaxLine({ label, steps, abilities }: { label: string; steps: number[]; abilities: Ability[] }) {
  const names = maxOrder(steps).map((id) => abilities.find((a) => a.id === id)?.name)
  return (
    <p>
      <span className="text-muted-foreground">{label}: </span>
      {names.length > 0 ? (
        <>
          {tr('complete as melhorias nesta ordem: ', 'fully upgrade in this order: ')}
          <strong>{names.join(' → ')}</strong>
        </>
      ) : (
        tr('a ordem não chega a completar nenhuma habilidade.', "the order doesn't fully upgrade any ability.")
      )}
    </p>
  )
}

export default function AbilityOrder({ hero, lang, authorSteps }: { hero: Hero; lang: Lang; authorSteps: number[] }) {
  const { data: allAbilities, error: abilitiesError } = useAbilities(lang)
  const { data: players, error: playersError, loading } = useAsync<PopularOrder>(() => getAbilityOrder(hero.id), [hero.id])
  const [choice, setChoice] = useState<'author' | 'players'>('author')

  const abilities = allAbilities ? hero.abilityClasses.map((c) => allAbilities[c]).filter((a): a is Ability => !!a) : []

  // builds antigas podem citar habilidades que o herói não tem mais: aí a ordem do autor não vale
  const known = new Set(abilities.map((a) => a.id))
  const author = validAuthorOrder(authorSteps, known)
  const popular = players && players.steps.length > 0 ? players : null
  const source = choice === 'author' && author ? 'author' : popular ? 'players' : author ? 'author' : null

  return (
    <section className="mt-5" aria-label={tr('Ordem das habilidades', 'Ability order')}>
      <h4 className="text-xl">{tr('Ordem das habilidades', 'Ability order')}</h4>

      {abilitiesError && <p className="mt-2 text-sm text-destructive">{abilitiesError}</p>}
      {!abilitiesError && (!allAbilities || loading) && <Skeleton className="mt-3 h-48" aria-busy="true" />}

      {allAbilities && !loading && (
        <>
          <div className="mt-2 space-y-1 text-sm">
            {author && <MaxLine label={tr('Autor', 'Author')} steps={author} abilities={abilities} />}
            {popular && <MaxLine label={tr('Jogadores', 'Players')} steps={popular.steps} abilities={abilities} />}
          </div>

          {!author && (
            <p className="mt-2 text-sm text-muted-foreground">
              {tr('Esta build não tem uma ordem de habilidades válida do autor.', "This build has no valid ability order from its author.")}
            </p>
          )}
          {playersError && (
            <p className="mt-2 text-sm text-destructive">
              {tr('Não consegui carregar a ordem dos jogadores:', "Couldn't load the players' order:")} {playersError}
            </p>
          )}

          {author && popular && (
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={source ?? ''}
              onValueChange={(v) => v && setChoice(v as 'author' | 'players')}
              aria-label={tr('Qual ordem mostrar', 'Which order to show')}
              className="mt-3"
            >
              <ToggleGroupItem value="author">{tr('Do autor', "Author's")}</ToggleGroupItem>
              <ToggleGroupItem value="players">{tr('Mais usada pelos jogadores', 'Most used by players')}</ToggleGroupItem>
            </ToggleGroup>
          )}

          {source && (
            <>
              <div className="mt-3">
                <OrderTable steps={source === 'author' ? author! : popular!.steps} abilities={abilities} />
              </div>
              <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                <LockOpen className="size-3.5" aria-hidden="true" /> {tr('desbloquear', 'unlock')} · 1, 2, 3 ={' '}
                {tr('melhorias da habilidade. Siga da esquerda para a direita.', 'ability upgrades. Follow from left to right.')}
              </p>
              {source === 'players' && popular && (
                <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                  {tr(
                    `Em cada passo, é a escolha mais comum entre quem fez os mesmos passos antes. A amostra vai de ${num(popular.firstSample)} partidas no primeiro ponto a ${num(popular.lastSample)} no último. Mais usada não quer dizer a melhor.`,
                    `Each step is the most common choice among players who made the same previous steps. The sample goes from ${num(popular.firstSample)} matches at the first point to ${num(popular.lastSample)} at the last. Most used doesn't mean best.`,
                  )}
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  )
}

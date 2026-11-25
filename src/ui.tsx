import { useEffect, useState, type ReactNode } from 'react'
import { TriangleAlert } from 'lucide-react'
import type { BuildOrder, Item } from './api'
import { num, tr, tx, type Text } from './i18n'
import { purchases, totalCost } from './shop'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function useAsync<T>(load: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{
    data: T | null
    error: string | null
    loading: boolean
  }>({ data: null, error: null, loading: true })

  useEffect(() => {
    let alive = true
    setState({ data: null, error: null, loading: true })
    load()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }))
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return state
}

// ---------- formatação ----------


// Tipos de item com as mesmas cores do jogo
export const SLOT: Record<string, { label: Text; text: string; edge: string }> = {
  weapon: { label: ['Arma', 'Weapon'], text: 'text-weapon', edge: 'border-weapon' },
  vitality: { label: ['Vitalidade', 'Vitality'], text: 'text-vitality', edge: 'border-vitality' },
  spirit: { label: ['Espírito', 'Spirit'], text: 'text-spirit', edge: 'border-spirit' },
}
const slotOf = (item: Item) =>
  SLOT[item.slot] ?? { label: [item.slot, item.slot] as const, text: 'text-muted-foreground', edge: 'border-border' }

// ---------- item ----------

export function ItemIcon({ item, className }: { item: Item; className?: string }) {
  return (
    <span
      className={cn('grid size-9 shrink-0 place-items-center rounded-md border-b-2 bg-muted', slotOf(item).edge, className)}
    >
      {item.image && <img src={item.image} alt="" loading="lazy" className="size-7 object-contain" />}
    </span>
  )
}

// Mostra o que o item faz ao passar o mouse ou focar com o teclado
export function ItemTip({ item, children }: { item: Item; children: ReactNode }) {
  const slot = slotOf(item)
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs space-y-1 p-3 text-left">
        <p className="font-heading text-base leading-tight">{item.name}</p>
        <p className="text-xs opacity-80">
          <span className={slot.text}>{tx(slot.label)}</span> · tier {item.tier} ·{' '}
          <span className="text-soul tabular-nums">
            {num(item.cost)} {tr('almas', 'souls')}
          </span>
        </p>
        {item.desc && <p className="text-sm leading-snug">{item.desc}</p>}
      </TooltipContent>
    </Tooltip>
  )
}

export function ItemChip({ item }: { item: Item | undefined }) {
  if (!item) return null
  return (
    <ItemTip item={item}>
      <span tabIndex={0} className="inline-flex items-center gap-2 rounded-md border bg-card py-1 pr-3 pl-1 text-sm">
        <ItemIcon item={item} className="size-8" />
        <span className="font-medium">{item.name}</span>
        <span className="text-soul tabular-nums">{num(item.cost)}</span>
      </span>
    </ItemTip>
  )
}

// Item que a build cita mas não existe mais na loja. `item` fica vazio quando a API nem o conhece.
export function GoneItem({ item }: { item: Item | undefined }) {
  const name = item && !item.name.startsWith('upgrade_') ? item.name : tr('Item desconhecido', 'Unknown item')
  const warning = tr('Este item não existe mais na loja', 'This item is no longer in the shop')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          className="inline-flex items-center gap-2 rounded-md border border-dashed border-soul bg-card py-1 pr-3 pl-1 text-sm"
        >
          {item ? (
            <ItemIcon item={item} className="size-8 opacity-50 grayscale" />
          ) : (
            <span className="size-8 shrink-0 rounded-md bg-muted" />
          )}
          <span className="text-muted-foreground line-through">{name}</span>
          <TriangleAlert className="size-4 shrink-0 text-soul" role="img" aria-label={warning} />
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs p-3 text-left">
        {warning}
      </TooltipContent>
    </Tooltip>
  )
}

// ---------- comanda de compras ----------
// A ordem de compra como uma comanda: cada linha mostra o custo do item e o total de almas gasto até ali.

const PHASE_LABELS: Record<string, Text> = {
  inicio: ['Início do jogo', 'Early game'],
  meio: ['Meio do jogo', 'Mid game'],
  fim: ['Fim do jogo', 'Late game'],
}

export function OrderLedger({
  order,
  items,
  badges,
  gone = [],
}: {
  order: BuildOrder
  items: Record<number, Item>
  badges?: Map<number, string>
  gone?: number[] // itens da build que não existem mais: aparecem no fim, fora da ordem e do custo
}) {
  const steps = order.steps.filter((s) => items[s.itemId])
  const bought = purchases(steps.map((s) => s.itemId), items)
  const buyById = new Map(bought.map((p) => [p.id, p]))
  const price = (id: number) => buyById.get(id)?.price ?? 0
  const total = totalCost(bought)
  const phaseTotals = new Map<string, number>()
  for (const s of steps) phaseTotals.set(s.phase, (phaseTotals.get(s.phase) ?? 0) + price(s.itemId))

  let running = 0
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-baseline justify-between gap-4 border-b bg-muted px-4 py-3">
        <p className="font-heading text-lg">{tr('Comanda de compras', 'Shopping list')}</p>
        <p className="text-sm text-muted-foreground">
          {steps.length} {tr('itens', 'items')} ·{' '}
          <span className="text-soul tabular-nums">
            {num(total)} {tr('almas', 'souls')}
          </span>
        </p>
      </div>
      <ol className="px-4 pb-3">
        {steps.map((s, i) => {
          const item = items[s.itemId]
          running += price(item.id)
          const upgrades = buyById.get(item.id)?.upgrades ?? []
          const first = i === 0 || steps[i - 1].phase !== s.phase
          const badge = badges?.get(s.itemId)
          return (
            <li key={s.itemId}>
              {first && (
                <div className="mt-5 mb-1 flex items-baseline justify-between border-b border-primary/40 pb-1 first:mt-3">
                  <h4 className="font-heading text-lg text-primary">{tx(PHASE_LABELS[s.phase])}</h4>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {num(phaseTotals.get(s.phase) ?? 0)} {tr('almas', 'souls')}
                  </span>
                </div>
              )}
              <div className="grid grid-cols-[1.75rem_auto_1fr] items-center gap-x-3 py-2">
                <span className="text-right text-sm text-muted-foreground tabular-nums">{i + 1}</span>
                <ItemTip item={item}>
                  <span tabIndex={0} className="rounded-md">
                    <ItemIcon item={item} />
                  </span>
                </ItemTip>
                <div className="min-w-0">
                  <div className="flex items-end gap-2">
                    <span className="truncate font-medium">{item.name}</span>
                    {badge && <Badge className="shrink-0 self-center">{tr('Novo', 'New')}</Badge>}
                    <span className="mb-1.5 min-w-4 flex-1 border-b-2 border-dotted border-muted-foreground/50" aria-hidden="true" />
                    <span className="text-soul tabular-nums">{num(price(item.id))}</span>
                  </div>
                  {upgrades.length > 0 && (
                    <p className="text-sm text-foreground/80">
                      {tr('Melhora', 'Upgrades')} {upgrades.map((id) => items[id].name).join(', ')}:{' '}
                      {tr(`você paga a diferença (preço cheio ${num(item.cost)})`, `you pay the difference (full price ${num(item.cost)})`)}
                    </p>
                  )}
                  <div className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
                    <span>{badge ?? s.reason}</span>
                    <span className="shrink-0 tabular-nums" title={tr('Almas gastas até aqui', 'Souls spent so far')}>
                      Σ {num(running)}
                    </span>
                  </div>
                  {badge && <p className="text-xs text-muted-foreground/80">{s.reason}</p>}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
      {gone.length > 0 && (
        <div className="border-t px-4 py-3">
          <h4 className="flex items-center gap-2 font-heading text-lg text-soul">
            <TriangleAlert className="size-4" aria-hidden="true" />
            {tr('Não existem mais na loja', 'No longer in the shop')}
          </h4>
          <p className="text-sm text-muted-foreground">
            {tr(
              'Estavam na build do autor. Não entram na ordem de compra nem no custo.',
              "They were in the author's build. They are not part of the purchase order or the cost.",
            )}
          </p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {gone.map((id) => (
              <li key={id}>
                <GoneItem item={items[id]} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

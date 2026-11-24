import { useEffect, useState, type ReactNode } from 'react'
import type { BuildOrder, Item } from './api'
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

export const souls = (n: number) => n.toLocaleString('pt-BR')
export const pct = (x: number) => `${(x * 100).toFixed(1).replace('.', ',')}%`
export const pp = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1).replace('.', ',')} p.p.`

// Tipos de item com as mesmas cores do jogo
export const SLOT: Record<string, { label: string; text: string; edge: string }> = {
  weapon: { label: 'Arma', text: 'text-weapon', edge: 'border-weapon' },
  vitality: { label: 'Vitalidade', text: 'text-vitality', edge: 'border-vitality' },
  spirit: { label: 'Espírito', text: 'text-spirit', edge: 'border-spirit' },
}
const slotOf = (item: Item) => SLOT[item.slot] ?? { label: item.slot, text: 'text-muted-foreground', edge: 'border-border' }

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
          <span className={slot.text}>{slot.label}</span> · tier {item.tier} ·{' '}
          <span className="text-soul tabular-nums">{souls(item.cost)} almas</span>
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
        <span className="text-soul tabular-nums">{souls(item.cost)}</span>
      </span>
    </ItemTip>
  )
}

// ---------- comanda de compras ----------
// A ordem de compra como uma comanda: cada linha mostra o custo do item e o total de almas gasto até ali.

const PHASE_LABELS: Record<string, string> = {
  inicio: 'Início do jogo',
  meio: 'Meio do jogo',
  fim: 'Fim do jogo',
}

export function OrderLedger({
  order,
  items,
  badges,
}: {
  order: BuildOrder
  items: Record<number, Item>
  badges?: Map<number, string>
}) {
  const steps = order.steps.filter((s) => items[s.itemId])
  const total = steps.reduce((sum, s) => sum + items[s.itemId].cost, 0)
  const phaseTotals = new Map<string, number>()
  for (const s of steps) phaseTotals.set(s.phase, (phaseTotals.get(s.phase) ?? 0) + items[s.itemId].cost)

  let running = 0
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-baseline justify-between gap-4 border-b bg-muted px-4 py-3">
        <p className="font-heading text-lg">Comanda de compras</p>
        <p className="text-sm text-muted-foreground">
          {steps.length} itens · <span className="text-soul tabular-nums">{souls(total)} almas</span>
        </p>
      </div>
      <ol className="px-4 pb-3">
        {steps.map((s, i) => {
          const item = items[s.itemId]
          running += item.cost
          const first = i === 0 || steps[i - 1].phase !== s.phase
          const badge = badges?.get(s.itemId)
          return (
            <li key={s.itemId}>
              {first && (
                <div className="mt-5 mb-1 flex items-baseline justify-between border-b border-primary/40 pb-1 first:mt-3">
                  <h4 className="font-heading text-lg text-primary">{PHASE_LABELS[s.phase]}</h4>
                  <span className="text-sm text-muted-foreground tabular-nums">
                    {souls(phaseTotals.get(s.phase) ?? 0)} almas
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
                    {badge && <Badge className="shrink-0 self-center">Novo</Badge>}
                    <span className="mb-1.5 min-w-4 flex-1 border-b-2 border-dotted border-muted-foreground/50" aria-hidden="true" />
                    <span className="text-soul tabular-nums">{souls(item.cost)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 text-sm text-muted-foreground">
                    <span>{badge ?? s.reason}</span>
                    <span className="shrink-0 tabular-nums" title="Almas gastas até aqui">
                      Σ {souls(running)}
                    </span>
                  </div>
                  {badge && <p className="text-xs text-muted-foreground/80">{s.reason}</p>}
                </div>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

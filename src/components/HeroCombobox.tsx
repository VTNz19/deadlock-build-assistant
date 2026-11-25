import { useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { normalize, type Hero } from '@/api'
import { classLabel, tr } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function HeroAvatar({ hero, className }: { hero: Hero; className?: string }) {
  const src = hero.images.icon_image_small_webp ?? hero.images.icon_hero_card_webp
  return src ? (
    <img src={src} alt="" loading="lazy" className={cn('size-7 shrink-0 rounded-full bg-muted object-cover', className)} />
  ) : (
    <span className={cn('size-7 shrink-0 rounded-full bg-muted', className)} />
  )
}

// Lista de heróis com busca por nome. `value` mostra o herói escolhido (modo único);
// sem `value`, o botão serve para adicionar heróis a uma lista.
export function HeroCombobox({
  heroes,
  value,
  placeholder,
  onSelect,
  className,
}: {
  heroes: Hero[]
  value?: number | null
  placeholder: string
  onSelect: (id: number) => void
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const selected = value != null ? heroes.find((h) => h.id === value) : undefined

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className="flex min-w-0 items-center gap-2">
            {selected && <HeroAvatar hero={selected} className="size-5" />}
            <span className={cn('truncate', !selected && 'text-muted-foreground')}>{selected?.name ?? placeholder}</span>
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder={tr('Buscar herói...', 'Search hero...')} />
          <CommandList>
            <CommandEmpty>{tr('Nenhum herói encontrado.', 'No heroes found.')}</CommandEmpty>
            <CommandGroup>
              {heroes.map((h) => (
                <CommandItem
                  key={h.id}
                  value={String(h.id)}
                  keywords={[h.portugueseName, h.englishName, normalize(h.portugueseName)]}
                  onSelect={() => {
                    onSelect(h.id)
                    setOpen(false)
                  }}
                >
                  <HeroAvatar hero={h} className="size-6" />
                  <span>{h.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{classLabel(h.hero_type)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

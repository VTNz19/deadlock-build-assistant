import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { getHeroes, type Hero } from './api'
import CompPage from './CompPage'
import HeroPage from './HeroPage'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

type Route = { page: 'home' } | { page: 'hero'; id: number } | { page: 'comp' }

function parseRoute(): Route {
  const hash = window.location.hash
  const hero = hash.match(/^#\/hero\/(\d+)(\?.*)?$/)
  if (hero) return { page: 'hero', id: Number(hero[1]) }
  if (hash.startsWith('#/comp')) return { page: 'comp' }
  return { page: 'home' }
}

const TYPE_LABELS: Record<string, string> = {
  brawler: 'Brawler',
  mystic: 'Mystic',
  marksman: 'Marksman',
  assassin: 'Assassin',
  healer: 'Healer',
}

function HeroGrid({ heroes }: { heroes: Hero[] }) {
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')

  const types = useMemo(() => [...new Set(heroes.map((h) => h.hero_type).filter((t): t is string => !!t))].sort(), [heroes])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return heroes.filter((h) => (type === 'all' || h.hero_type === type) && (!q || h.name.toLowerCase().includes(q)))
  }, [heroes, query, type])

  return (
    <>
      <div className="mb-8 max-w-2xl">
        <h1 className="text-4xl sm:text-5xl">Escolha um herói</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Veja as builds da comunidade na ordem em que vale comprar, e o que levar contra cada inimigo.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar herói"
            aria-label="Buscar herói"
            className="pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <ToggleGroup
          type="single"
          variant="outline"
          value={type}
          onValueChange={(v) => setType(v || 'all')}
          aria-label="Filtrar por classe"
          className="flex-wrap"
        >
          <ToggleGroupItem value="all">Todos</ToggleGroupItem>
          {types.map((t) => (
            <ToggleGroupItem key={t} value={t}>
              {TYPE_LABELS[t] ?? t}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-muted-foreground">
          Nenhum herói com esse filtro.{' '}
          <button
            type="button"
            className="text-primary underline underline-offset-4"
            onClick={() => {
              setQuery('')
              setType('all')
            }}
          >
            Limpar filtros
          </button>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filtered.map((hero, i) => (
            <a
              key={hero.id}
              href={`#/hero/${hero.id}`}
              style={{ '--i': i } as React.CSSProperties}
              className="deal group relative block overflow-hidden rounded-md border bg-card transition-colors hover:border-primary focus-visible:border-primary"
            >
              {hero.images.icon_hero_card_webp && (
                <img
                  src={hero.images.icon_hero_card_webp}
                  alt=""
                  loading="lazy"
                  className="aspect-[3/4] w-full object-cover"
                />
              )}
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/85 to-transparent px-3 pt-10 pb-2.5">
                <span className="block font-heading text-lg leading-tight">{hero.name}</span>
                <span className="block text-xs text-muted-foreground">{TYPE_LABELS[hero.hero_type ?? ''] ?? hero.hero_type}</span>
              </span>
            </a>
          ))}
        </div>
      )}
    </>
  )
}

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <a
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'border-b-2 px-1 py-1 text-sm transition-colors',
        active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </a>
  )
}

export default function App() {
  const [heroes, setHeroes] = useState<Hero[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [route, setRoute] = useState<Route>(parseRoute)

  useEffect(() => {
    getHeroes()
      .then(setHeroes)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const selected = route.page === 'hero' ? heroes.find((h) => h.id === route.id) : undefined

  return (
    <TooltipProvider delayDuration={150}>
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-4 py-4">
          <a href="#/" className="flex items-baseline gap-3">
            <span className="font-heading text-2xl font-semibold">Deadlock</span>
            <span className="text-sm text-muted-foreground">Assistente de builds</span>
          </a>
          <nav className="flex gap-5" aria-label="Principal">
            <NavLink href="#/" active={route.page !== 'comp'}>
              Heróis
            </NavLink>
            <NavLink href="#/comp" active={route.page === 'comp'}>
              Montar composição
            </NavLink>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 pb-20">
        {loading && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6" aria-busy="true">
            {Array.from({ length: 12 }, (_, i) => (
              <Skeleton key={i} className="aspect-[3/4] rounded-md" />
            ))}
          </div>
        )}

        {error && (
          <div className="max-w-lg rounded-lg border border-destructive/50 bg-card p-5">
            <p className="font-heading text-xl">Não consegui carregar os heróis</p>
            <p className="mt-1 text-muted-foreground">{error}</p>
            <Button className="mt-4" onClick={() => window.location.reload()}>
              Tentar de novo
            </Button>
          </div>
        )}

        {!loading && !error && route.page === 'home' && <HeroGrid heroes={heroes} />}
        {!loading && !error && route.page === 'comp' && <CompPage heroes={heroes} />}
        {!loading && !error && route.page === 'hero' && selected && <HeroPage hero={selected} />}
        {!loading && !error && route.page === 'hero' && !selected && (
          <p className="text-muted-foreground">
            Herói não encontrado. <a href="#/" className="text-primary underline underline-offset-4">Voltar à lista</a>
          </p>
        )}
      </main>

      <footer className="border-t">
        <p className="mx-auto max-w-6xl px-4 py-6 text-sm text-muted-foreground">
          Projeto de fã, não afiliado à Valve. Deadlock e as imagens do jogo pertencem à Valve. Dados de itens, builds e
          partidas:{' '}
          <a
            href="https://deadlock-api.com"
            target="_blank"
            rel="noreferrer"
            className="text-foreground underline underline-offset-4 hover:text-primary"
          >
            Deadlock API
          </a>
          .
        </p>
      </footer>
    </TooltipProvider>
  )
}

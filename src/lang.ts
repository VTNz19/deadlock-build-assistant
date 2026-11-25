import { useEffect, useState } from 'react'
import { getAbilities, getItems, type Ability, type Hero, type Item, type Lang } from './api'
import { setCurrentLang, tr } from './i18n'

// Idioma do site inteiro: textos da interface e dados do jogo (nomes de heróis e itens, descrições).

const STORAGE_KEY = 'dl:lang'

export function useLang() {
  const [lang, setLang] = useState<Lang>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'en' ? 'en' : 'pt'
    } catch {
      return 'pt'
    }
  })

  setCurrentLang(lang) // antes de os componentes filhos serem desenhados

  useEffect(() => {
    document.documentElement.lang = lang === 'en' ? 'en' : 'pt-BR'
    document.title = tr('Deadlock · Assistente de builds', 'Deadlock · Build assistant')
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        'content',
        tr(
          'Builds da comunidade, ordem de compra e o que levar contra cada inimigo no Deadlock.',
          'Community builds, purchase order and what to buy against each enemy in Deadlock.',
        ),
      )
    try {
      localStorage.setItem(STORAGE_KEY, lang)
    } catch {
      // sem armazenamento: a escolha vale só até recarregar a página
    }
  }, [lang])

  return [lang, setLang] as const
}

export function localizeHeroes(heroes: Hero[], lang: Lang): Hero[] {
  return heroes
    .map((h) => ({ ...h, name: lang === 'en' ? h.englishName : h.portugueseName }))
    .sort((a, b) => a.name.localeCompare(b.name, lang === 'en' ? 'en' : 'pt-BR'))
}

// Ao trocar de idioma, os itens antigos continuam na tela até os novos chegarem.
// Assim a página não é desmontada e a build, a aba e os filtros escolhidos não se perdem.
export const useItems = (lang: Lang) => useKeptByLang<Record<number, Item>>(getItems, lang)
export const useAbilities = (lang: Lang) => useKeptByLang<Record<string, Ability>>(getAbilities, lang)

function useKeptByLang<T>(load: (lang: Lang) => Promise<T>, lang: Lang) {
  const [state, setState] = useState<{ data: T | null; error: string | null }>({
    data: null,
    error: null,
  })

  useEffect(() => {
    let alive = true
    load(lang)
      .then((data) => alive && setState({ data, error: null }))
      .catch((e: Error) => alive && setState((s) => ({ data: s.data, error: e.message })))
    return () => {
      alive = false
    }
  }, [load, lang])

  return state
}

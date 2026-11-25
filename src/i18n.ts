import type { Lang } from './api'

// Tradução do site. Cada texto fica ao lado de onde é usado, nos dois idiomas: tr('Herói', 'Hero').
// O idioma atual é definido pelo App (useLang) antes de o resto da tela ser desenhado.
// Por isso, não chame tr() fora de funções: o texto ficaria preso no idioma do carregamento.

let current: Lang = 'pt'

export const setCurrentLang = (lang: Lang) => {
  current = lang
}
export const getLang = () => current

export const tr = (pt: string, en: string) => (current === 'en' ? en : pt)

// para textos guardados em listas fixas: [português, inglês]
export type Text = readonly [pt: string, en: string]
export const tx = ([pt, en]: Text) => tr(pt, en)

// ---------- números ----------

export const num = (n: number) => n.toLocaleString(tr('pt-BR', 'en-US'))
export const dec = (x: number, digits = 1) => x.toFixed(digits).replace('.', tr(',', '.'))
export const pct = (x: number) => `${dec(x * 100)}%`
export const pp = (x: number) => `${x >= 0 ? '+' : ''}${dec(x * 100)} ${tr('p.p.', 'pp')}`

// ---------- classes dos heróis ----------

const CLASS_LABELS: Record<string, Text> = {
  brawler: ['Lutador', 'Brawler'],
  mystic: ['Místico', 'Mystic'],
  marksman: ['Atirador', 'Marksman'],
  assassin: ['Assassino', 'Assassin'],
  healer: ['Curador', 'Healer'],
}
export const classLabel = (type: string | undefined) => (type && CLASS_LABELS[type] ? tx(CLASS_LABELS[type]) : (type ?? ''))

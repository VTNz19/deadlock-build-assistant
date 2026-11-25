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
// Resumo escrito para o site (a API só informa a classe de cada herói, não o que ela significa)
const CLASS_SUMMARIES: Record<string, Text> = {
  assassin: [
    'Caça alvos desprevenidos ou isolados: chega rápido, causa muito dano em pouco tempo e escapa.',
    'Hunts unaware or isolated targets: gets in fast, deals a lot of damage quickly and gets out.',
  ],
  brawler: [
    'Linha de frente: avança para lutar de perto, aguenta bastante dano e puxa a briga.',
    'Frontline: pushes in to fight up close, soaks up a lot of damage and starts fights.',
  ],
  healer: [
    'Apoia a equipe: cura ou protege os aliados e ajuda a virar as lutas em grupo.',
    'Supports the team: heals or protects allies and helps turn team fights.',
  ],
  marksman: [
    'Depende da mira e do posicionamento: o forte é causar dano com disparos, de preferência sem se expor.',
    'Relies on aim and positioning: excels at dealing damage with shots, ideally without being exposed.',
  ],
  mystic: [
    'Se apoia nas habilidades: causa dano com poderes, controla áreas e atrapalha os inimigos.',
    'Relies on abilities: deals damage with powers, controls areas and disrupts enemies.',
  ],
}
export const classSummary = (type: string | undefined) => (type && CLASS_SUMMARIES[type] ? tx(CLASS_SUMMARIES[type]) : '')

export const classLabel = (type: string | undefined) => (type && CLASS_LABELS[type] ? tx(CLASS_LABELS[type]) : (type ?? ''))

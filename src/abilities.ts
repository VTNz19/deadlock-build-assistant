// Ordem das habilidades. Uma ordem é a lista dos ids na sequência em que os pontos são gastos:
// a primeira vez que um id aparece é o desbloqueio; as três seguintes são as melhorias 1, 2 e 3.

export const MAX_PER_ABILITY = 4

// partidas mínimas para continuar escolhendo o próximo ponto pela maioria
const MIN_SAMPLE = 100

export interface OrderRow {
  abilities: number[]
  matches: number
}

export interface PopularOrder {
  steps: number[]
  firstSample: number // partidas consideradas no primeiro ponto
  lastSample: number // partidas consideradas no último ponto (a amostra diminui a cada passo)
}

// Monta a ordem passo a passo: em cada ponto, escolhe o que a maioria fez entre quem fez os mesmos
// passos anteriores. Contar só sequências idênticas não serve: elas têm tamanhos diferentes (a partida
// acaba antes), e isso divide os votos.
export function popularOrder(rows: OrderRow[]): PopularOrder {
  const steps: number[] = []
  let following = rows
  let firstSample = 0
  let lastSample = 0
  for (let i = 0; i < 4 * MAX_PER_ABILITY; i++) {
    const votes = new Map<number, number>()
    for (const r of following) {
      const next = r.abilities[i]
      if (next !== undefined) votes.set(next, (votes.get(next) ?? 0) + r.matches)
    }
    const total = [...votes.values()].reduce((a, b) => a + b, 0)
    if (total < MIN_SAMPLE) break
    const [best] = [...votes].sort((a, b) => b[1] - a[1])[0]
    steps.push(best)
    following = following.filter((r) => r.abilities[i] === best)
    if (i === 0) firstSample = total
    lastSample = total
  }
  return { steps, firstSample, lastSample }
}

// Que ponto é cada passo: 0 = desbloqueio, 1 a 3 = melhoria
export function stepLevels(steps: number[]): number[] {
  const count = new Map<number, number>()
  return steps.map((id) => {
    const level = count.get(id) ?? 0
    count.set(id, level + 1)
    return level
  })
}

// Algumas builds trazem, depois dos 16 pontos do herói, sobras com habilidades que não são dele.
// Uso a ordem se os 16 pontos vierem completos antes das sobras; uma habilidade estranha antes disso
// indica build antiga (o herói mudou), e aí a ordem do autor não vale.
export function validAuthorOrder(steps: number[], heroAbilities: Set<number>): number[] | null {
  const strange = steps.findIndex((id) => !heroAbilities.has(id))
  if (strange === -1) return steps.length > 0 ? steps : null
  return strange === 4 * MAX_PER_ABILITY ? steps.slice(0, strange) : null
}

// Habilidades na ordem em que ficam com todas as melhorias
export function maxOrder(steps: number[]): number[] {
  const levels = stepLevels(steps)
  return steps.filter((_, i) => levels[i] === MAX_PER_ABILITY - 1)
}

import type { Item, ItemStat } from './api'
import { tx, type Text } from './i18n'

// Descobre, pelas propriedades reais dos itens (vindas do jogo), quais itens ajudam contra cada tipo
// de ameaça. Como lê os dados da API, acompanha os patches sozinho.

export type ThreatId = 'spirit' | 'bullet' | 'tank' | 'heal'

interface Rule {
  key: string
  test: (v: number) => boolean
  label: Text
  unit?: string // vazio = não mostra o número
  needsEnemyText?: boolean // o texto do item precisa falar do inimigo/alvo (evita efeitos no próprio jogador)
}

export interface Threat {
  id: ThreatId
  label: Text
  hint: Text
  rules: Rule[]
}

export const THREATS: Threat[] = [
  {
    id: 'spirit',
    label: ['Muito dano de habilidade', 'Heavy ability damage'],
    hint: ['Inimigo que te mata com habilidades (dano de espírito). Itens que dão resistência a espírito.', 'An enemy killing you with abilities (spirit damage). Items that give spirit resist.'],
    rules: [
      { key: 'TechResist', test: (v) => v >= 10, label: ['Resistência a espírito', 'Spirit resist'], unit: '%' },
      { key: 'BuffTechResist', test: (v) => v > 0, label: ['Resistência a espírito (ativo)', 'Spirit resist (active)'], unit: '%' },
      { key: 'TechResistBelowThreshold', test: (v) => v > 0, label: ['Resistência extra com pouca vida', 'Extra resist at low health'], unit: '%' },
      { key: 'TechDamageReduction', test: (v) => v <= -10, label: ['Dano de espírito inimigo', 'Enemy spirit damage'], unit: '%' },
      { key: 'SpiritDamageReductionProc', test: (v) => v !== 0, label: ['Reduz dano de espírito', 'Reduces spirit damage'] },
    ],
  },
  {
    id: 'bullet',
    label: ['Muito dano de disparo', 'Heavy bullet damage'],
    hint: ['Inimigo que te mata atirando. Itens que dão resistência a disparo.', 'An enemy killing you with gunfire. Items that give bullet resist.'],
    rules: [
      { key: 'BulletResist', test: (v) => v >= 10, label: ['Resistência a disparo', 'Bullet resist'], unit: '%' },
      { key: 'BuffBulletResist', test: (v) => v > 0, label: ['Resistência a disparo (ativo)', 'Bullet resist (active)'], unit: '%' },
      { key: 'BulletResistBelowThreshold', test: (v) => v > 0, label: ['Resistência extra com pouca vida', 'Extra resist at low health'], unit: '%' },
      { key: 'ReturnFireBulletResist', test: (v) => v > 0, label: ['Resistência ao revidar', 'Resist when returning fire'], unit: '%' },
    ],
  },
  {
    id: 'tank',
    label: ['Inimigo tankando muito', 'Enemy is very tanky'],
    hint: ['Muita vida e resistência. Itens que dão dano baseado na vida do alvo ou reduzem a resistência dele.', "Lots of health and resist. Items that deal damage based on the target's health or shred their resist."],
    rules: [
      { key: 'CurrentHealthDamage', test: (v) => v > 0, label: ['Dano extra pela vida atual', 'Bonus damage from current health'], unit: '%' },
      { key: 'MaxHealthDamage', test: (v) => v > 0, label: ['Dano extra pela vida máxima', 'Bonus damage from max health'], unit: '%' },
      { key: 'MaxHealthPercentAsDPS', test: (v) => v > 0, label: ['Dano por segundo pela vida máxima', 'Damage per second from max health'], unit: '%' },
      { key: 'HealthPctDamage', test: (v) => v > 0, label: ['Dano pela vida do alvo', "Damage from target's health"], unit: '%' },
      { key: 'DotHealthPercent', test: (v) => v > 0, label: ['Dano contínuo pela vida', 'Health-based damage over time'], unit: '%' },
      { key: 'BulletResistReduction', test: (v) => v <= -5, label: ['Reduz resistência a disparo do alvo', "Reduces target's bullet resist"], unit: '%' },
      { key: 'MagicResistReduction', test: (v) => v <= -5, label: ['Reduz resistência a espírito do alvo', "Reduces target's spirit resist"], unit: '%' },
      { key: 'TechArmorDamageReduction', test: (v) => v <= -5, label: ['Reduz resistência a espírito do alvo', "Reduces target's spirit resist"], unit: '%' },
    ],
  },
  {
    id: 'heal',
    label: ['Inimigo se curando muito', 'Enemy is healing a lot'],
    hint: ['Cura alta ou sustain. Itens que reduzem a cura recebida pelo inimigo.', 'High healing or sustain. Items that reduce the healing the enemy receives.'],
    rules: [
      {
        key: 'HealAmpReceivePenaltyPercent',
        test: (v) => v <= -30,
        label: ['Reduz a cura recebida do inimigo', "Reduces enemy's incoming healing"],
        unit: '%',
        needsEnemyText: true,
      },
    ],
  },
]

// Propriedades que o app guarda de cada item (o resto é descartado para o cache ficar pequeno)
// TechPower / BaseAttackDamagePercent / BonusFireRate servem para estimar se um herói causa dano de espírito ou de arma
export const PROP_KEYS = [
  ...new Set([
    ...THREATS.flatMap((t) => t.rules.map((r) => r.key)),
    'TechPower',
    'BaseAttackDamagePercent',
    'BonusFireRate',
  ]),
]

export interface CounterItem {
  item: Item
  strength: number // magnitude do maior efeito (0..100)
  effects: string[]
  stat?: ItemStat
}

export function findCounters(
  threat: Threat,
  items: Record<number, Item>,
  statById: Map<number, ItemStat>,
): CounterItem[] {
  const out: CounterItem[] = []
  for (const item of Object.values(items)) {
    if (!item.shopable) continue
    const effectByLabel = new Map<string, string>() // evita mostrar o mesmo efeito duas vezes
    let strength = 0
    for (const rule of threat.rules) {
      const v = item.props[rule.key]
      if (v === undefined || !rule.test(v)) continue
      if (rule.needsEnemyText && !/enem|target|their|alvo|inimig/i.test(item.desc)) continue
      const shown = rule.unit ? ` ${v > 0 ? '+' : ''}${v}${rule.unit}` : ''
      const label = tx(rule.label)
      if (!effectByLabel.has(label)) effectByLabel.set(label, `${label}${shown}`)
      strength = Math.max(strength, Math.abs(v))
    }
    const effects = [...effectByLabel.values()]
    if (effects.length > 0) out.push({ item, strength, effects, stat: statById.get(item.id) })
  }
  return out
}

import type { ElementalAura, ElementType, ReactionType } from '../core/Types';

export interface ReactionOutcome {
  finalDamage: number;
  isCrit: boolean;
  reaction: ReactionType | null;
  reactionLabelKr: string | null;
  reactionColorCss: string | null;
  bonusAoeElement: ElementType | null;
  bonusAoeRadius: number;
  bonusAoeDamage: number;
  applyFreeze: boolean;
  applyDefDown: boolean;
  triggerChainLightning: boolean;
  grantCrystallizeShield: ElementType | null;
  knockbackForce: number;
}

const REACTION_LABELS: Record<ReactionType, { label: string; color: string }> = {
  vaporize: { label: '증발!', color: '#ff9c59' },
  melt: { label: '융해!', color: '#ffd573' },
  overloaded: { label: '과부하!', color: '#ff526b' },
  electroCharged: { label: '감전!', color: '#cc7bff' },
  swirl: { label: '확산!', color: '#5effd5' },
  frozen: { label: '빙결!', color: '#9cf5ff' },
  superconduct: { label: '초전도!', color: '#b5d6ff' },
  crystallize: { label: '결정화!', color: '#f5cf64' },
};

export function resolveHitAndReaction(params: {
  rawDamage: number;
  incomingElement: ElementType;
  critRate: number;
  critDmg: number;
  targetAura: ElementalAura | null;
  targetFrozen: boolean;
  targetOmen: boolean;
  targetDefDown: boolean;
  isHeavyBlunt: boolean;
}): { outcome: ReactionOutcome; nextAura: ElementalAura | null } {
  const isCrit = Math.random() < params.critRate;
  let dmg = params.rawDamage * (isCrit ? 1 + params.critDmg : 1);

  if (params.targetOmen) dmg *= 1.45;
  if (params.targetDefDown) dmg *= 1.3;

  let reaction: ReactionType | null = null;
  let reactionLabelKr: string | null = null;
  let reactionColorCss: string | null = null;
  let bonusAoeElement: ElementType | null = null;
  let bonusAoeRadius = 0;
  let bonusAoeDamage = 0;
  let applyFreeze = false;
  let applyDefDown = false;
  let triggerChainLightning = false;
  let grantCrystallizeShield: ElementType | null = null;
  let knockbackForce = 0;

  let nextAura: ElementalAura | null = params.targetAura ? { ...params.targetAura } : null;

  if (params.targetFrozen && params.isHeavyBlunt) {
    dmg *= 1.45;
    reactionLabelKr = '쇄빙!';
    reactionColorCss = '#b5f8ff';
  }

  const existing = nextAura?.element;
  const inc = params.incomingElement;

  if (inc === 'physical') {
    return {
      outcome: {
        finalDamage: Math.max(1, Math.round(dmg)),
        isCrit,
        reaction: null,
        reactionLabelKr,
        reactionColorCss,
        bonusAoeElement: null,
        bonusAoeRadius: 0,
        bonusAoeDamage: 0,
        applyFreeze: false,
        applyDefDown: false,
        triggerChainLightning: false,
        grantCrystallizeShield: null,
        knockbackForce: 0,
      },
      nextAura,
    };
  }

  if (!existing || existing === inc || existing === 'physical') {
    if (inc !== 'geo' && inc !== 'anemo') {
      nextAura = { element: inc, gauge: 1, timer: 9.0 };
    }
  } else {
    if ((inc === 'pyro' && existing === 'hydro') || (inc === 'hydro' && existing === 'pyro')) {
      reaction = 'vaporize';
      dmg *= inc === 'hydro' ? 2.0 : 1.5;
      nextAura = null;
    } else if ((inc === 'pyro' && existing === 'cryo') || (inc === 'cryo' && existing === 'pyro')) {
      reaction = 'melt';
      dmg *= inc === 'pyro' ? 2.0 : 1.5;
      nextAura = null;
    } else if ((inc === 'pyro' && existing === 'electro') || (inc === 'electro' && existing === 'pyro')) {
      reaction = 'overloaded';
      bonusAoeElement = 'pyro';
      bonusAoeRadius = 5.6;
      bonusAoeDamage = Math.round(params.rawDamage * 1.18);
      knockbackForce = 11.0;
      nextAura = null;
    } else if ((inc === 'hydro' && existing === 'electro') || (inc === 'electro' && existing === 'hydro')) {
      reaction = 'electroCharged';
      triggerChainLightning = true;
      bonusAoeElement = 'electro';
      bonusAoeRadius = 6.2;
      bonusAoeDamage = Math.round(params.rawDamage * 0.78);
      nextAura = { element: 'electro', gauge: 0.6, timer: 4.5 };
    } else if (inc === 'anemo' && ['pyro', 'hydro', 'electro', 'cryo'].includes(existing)) {
      reaction = 'swirl';
      bonusAoeElement = existing;
      bonusAoeRadius = 6.5;
      bonusAoeDamage = Math.round(params.rawDamage * 0.88);
      nextAura = null;
    } else if (inc === 'geo' && ['pyro', 'hydro', 'electro', 'cryo'].includes(existing)) {
      reaction = 'crystallize';
      grantCrystallizeShield = existing;
      nextAura = null;
    } else if ((inc === 'hydro' && existing === 'cryo') || (inc === 'cryo' && existing === 'hydro')) {
      reaction = 'frozen';
      applyFreeze = true;
      nextAura = { element: 'cryo', gauge: 1, timer: 4.0 };
    } else if ((inc === 'cryo' && existing === 'electro') || (inc === 'electro' && existing === 'cryo')) {
      reaction = 'superconduct';
      applyDefDown = true;
      bonusAoeElement = 'cryo';
      bonusAoeRadius = 5.6;
      bonusAoeDamage = Math.round(params.rawDamage * 0.68);
      nextAura = null;
    } else if (inc !== 'geo' && inc !== 'anemo') {
      nextAura = { element: inc, gauge: 1, timer: 9.0 };
    }
  }

  if (reaction) {
    reactionLabelKr = REACTION_LABELS[reaction].label;
    reactionColorCss = REACTION_LABELS[reaction].color;
  }

  return {
    outcome: {
      finalDamage: Math.max(1, Math.round(dmg)),
      isCrit,
      reaction,
      reactionLabelKr,
      reactionColorCss,
      bonusAoeElement,
      bonusAoeRadius,
      bonusAoeDamage,
      applyFreeze,
      applyDefDown,
      triggerChainLightning,
      grantCrystallizeShield,
      knockbackForce,
    },
    nextAura,
  };
}

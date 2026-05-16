// ─────────────────────────────────────────────────────────────
// abilities.js — Activated ability flow
//
// Costs:
//   { gold: N, exhaust: true, overexhaust: true, sacrificeSelf: true }
// ─────────────────────────────────────────────────────────────

import { G } from './state.js';
import { runEffects } from './effects.js';
import { getCardEffects, hasActivatedAbility } from './card-effects.js';
import { sacrificeCreature } from './sacrifice.js';
import { sacrificeRelic } from './relics.js';
import { getKeywordValue } from './keywords.js';

export function canActivateAbility(side, kind, slotIdx) {
  const arr = kind === 'creature' ? G[side]?.creatures : G[side]?.relics;
  const inst = arr?.[slotIdx];
  if (!inst) return { ok: false, error: 'No card there' };

  if (!hasActivatedAbility(inst)) {
    return { ok: false, error: `${inst.name} has no activated ability`, unsupported: true };
  }

  const def = getCardEffects(inst);
  const ability = def.activatedAbility;
  const cost = ability.cost || {};

  if (cost.exhaust && (inst.exhausted || inst.overexhausted)) {
    return { ok: false, error: 'Already exhausted' };
  }
  if (cost.overexhaust) {
    if (!inst.exhausted) return { ok: false, error: 'Must be exhausted first' };
    if (inst.overexhausted) return { ok: false, error: 'Already overexhausted' };
  }
  if (cost.gold && (G[side].gold || 0) < cost.gold) {
    return { ok: false, error: `Need ${cost.gold} gold` };
  }
  if (ability.oncePerTurn && inst._abilityUsedThisTurn) {
    return { ok: false, error: 'Already used this turn' };
  }
  return { ok: true, inst, ability };
}

export function getAbilityTargetRequirements(side, kind, slotIdx) {
  const arr = kind === 'creature' ? G[side]?.creatures : G[side]?.relics;
  const inst = arr?.[slotIdx];
  if (!inst) return [];
  const def = getCardEffects(inst);
  return def?.activatedAbility?.targets || [];
}

export function activateAbility(side, kind, slotIdx, targets = []) {
  const pre = canActivateAbility(side, kind, slotIdx);
  if (!pre.ok) return pre;
  const { inst, ability } = pre;
  const cost = ability.cost || {};

  // Pay costs
  if (cost.gold) G[side].gold = (G[side].gold || 0) - cost.gold;
  if (cost.exhaust) {
    if (inst.exhausted) inst.overexhausted = true;
    else inst.exhausted = true;
    // SELFBLEED X triggers when a creature exhausts to activate an ability (§6.5)
    const selfbleedAmount = getKeywordValue(inst, 'SELFBLEED');
    if (selfbleedAmount > 0) {
      G[side].bleedPool = (G[side].bleedPool || 0) + selfbleedAmount;
    }
  }
  if (cost.overexhaust) {
    inst.overexhausted = true;
  }
  if (ability.oncePerTurn) {
    inst._abilityUsedThisTurn = true;
  }

  // Run effects
  const result = runEffects(ability.effects || [], {
    sourceSide: side,
    sourceCard: inst,
    sourceSlotIdx: slotIdx,
    targets,
  });

  // Sacrifice self last (after effects can reference it)
  if (cost.sacrificeSelf) {
    if (kind === 'creature') sacrificeCreature(side, slotIdx);
    else if (kind === 'relic') sacrificeRelic(side, slotIdx);
  }

  return { ok: true, inst, events: result.events };
}

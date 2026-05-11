// ─────────────────────────────────────────────────────────────
// spells.js — Spell casting flow
// ─────────────────────────────────────────────────────────────

import { G } from './state.js';
import { runEffects } from './effects.js';
import { getCardEffects, isSpellSupported } from './card-effects.js';

export function canPlaySpell(side, instId) {
  const hand = G[side]?.hand || [];
  const inst = hand.find(c => c.instId === instId);
  if (!inst) return { ok: false, error: 'Card not in hand' };
  if (!['Spell', 'spell'].includes(inst.type)) return { ok: false, error: 'Not a spell' };

  const goldCost = inst.goldCost || 0;
  const bloodCost = inst.bloodCost || 0;
  if ((G[side].gold || 0) < goldCost) return { ok: false, error: `Need ${goldCost} gold` };
  if ((G[side].blood || 0) <= bloodCost) return { ok: false, error: 'Cannot pay blood' };

  if (!isSpellSupported(inst)) {
    return { ok: false, error: `${inst.name}: effect not yet supported`, unsupported: true };
  }
  return { ok: true, inst };
}

export function getSpellTargetRequirements(inst) {
  const e = getCardEffects(inst);
  return e?.targets || [];
}

export function playSpellFromHand(side, instId, targets = []) {
  const pre = canPlaySpell(side, instId);
  if (!pre.ok) return pre;
  const inst = pre.inst;
  const def = getCardEffects(inst);

  G[side].gold = (G[side].gold || 0) - (inst.goldCost || 0);
  if (inst.bloodCost > 0) G[side].blood = (G[side].blood || 0) - inst.bloodCost;

  const hand = G[side].hand;
  const handIdx = hand.findIndex(c => c.instId === instId);
  if (handIdx >= 0) hand.splice(handIdx, 1);
  G[side].discard = G[side].discard || [];
  G[side].discard.push(inst);

  const result = runEffects(def.onPlay || [], {
    sourceSide: side,
    sourceCard: inst,
    targets,
  });

  return { ok: true, inst, events: result.events };
}

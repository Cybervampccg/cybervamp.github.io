// ─────────────────────────────────────────────────────────────
// triggers.js — Triggered ability dispatch
//
// Wires ON_DEATH callbacks into sacrifice.js and exports helpers
// for combat.js to fire ON_DIRECT_DAMAGE and ON_KILL triggers.
//
// Import cycle note:
//   effects.js → sacrifice.js (sacrificeCreature)
//   triggers.js → effects.js (runEffects)
//   triggers.js → sacrifice.js (registerOnDeathCallback)
//   sacrifice.js does NOT import triggers.js → no cycle.
//
// This module must be imported once at game startup (battle-screen.js)
// to register the onDeath hook.
// ─────────────────────────────────────────────────────────────

import { registerOnDeathCallback } from './sacrifice.js';
import { runEffects } from './effects.js';
import { getCardEffects } from './card-effects.js';
import { G } from './state.js';

// ───────── ON_DEATH ─────────

registerOnDeathCallback((side, slotIdx, inst) => {
  const def = getCardEffects(inst);
  if (!def?.onDeath) return;
  runEffects(def.onDeath, {
    sourceSide: side,
    sourceCard: inst,
    sourceSlotIdx: slotIdx,
    targets: [],
  });
});

// ───────── ON_DIRECT_DAMAGE ─────────
// Called from combat.js after direct damage is dealt.

export function fireOnDirectDamage(attackerSide, attackerSlotIdx, attackerInst, defenderSide, events) {
  const def = getCardEffects(attackerInst);
  if (!def?.onDirectDamage) return;
  const ctx = {
    sourceSide: attackerSide,
    sourceCard: attackerInst,
    sourceSlotIdx: attackerSlotIdx,
    _defenderSide: defenderSide,
    targets: [],
  };
  const result = runEffects(def.onDirectDamage, ctx);
  events.push(...result.events);
}

// ───────── ON_KILL ─────────
// Called from combat.js when this creature's attack destroys the blocker.

export function fireOnKill(attackerSide, attackerSlotIdx, attackerInst, events) {
  const def = getCardEffects(attackerInst);
  if (!def?.onKill) return;
  const ctx = {
    sourceSide: attackerSide,
    sourceCard: attackerInst,
    sourceSlotIdx: attackerSlotIdx,
    targets: [],
  };
  const result = runEffects(def.onKill, ctx);
  events.push(...result.events);
}

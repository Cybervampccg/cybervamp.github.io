// ─────────────────────────────────────────────────────────────
// combat.js — Combat resolution logic for Cybervamp v2
//
// Combat flow:
//   1. Active player declares attackers (one or more unexhausted creatures)
//   2. Defender assigns blockers (or null = "go to face")
//   3. resolveCombat() runs each attacker → blocker pairing
//   4. Damage applied, creatures exhausted, bleed accumulated
//   5. resolvePostBattle() drains bleed pools, checks win condition
//
// Simplification for first pass (Session D-1):
//   - One blocker per attacker (no supporters yet)
//   - No "Hemorrhage" bonus (active while bleed > 0)
//   - No "Breaker" (excess damage to face)
//   - No death triggers
//   - Damaged creatures don't track damage between turns — they survive at full
//     power if their power >= attacker's power, or are destroyed if not
// ─────────────────────────────────────────────────────────────

import { G } from './state.js';
import { sacrificeCreature } from './sacrifice.js';

// Attempts to compute effective power for an instance.
// Falls back to inst.power if no advanced power calc available.
function getPower(inst) {
  if (typeof window !== 'undefined' && typeof window.getEffectivePower === 'function') {
    try { return window.getEffectivePower(inst); } catch (e) {}
  }
  return inst.power || 0;
}

// Mark a creature as an attacker.
// Returns { ok, error }.
export function declareAttacker(side, slotIdx) {
  const inst = G[side]?.creatures?.[slotIdx];
  if (!inst) return { ok: false, error: 'No creature there' };
  if (inst.exhausted || inst.overexhausted) {
    return { ok: false, error: 'Creature is exhausted' };
  }
  if (getPower(inst) <= 0) {
    return { ok: false, error: 'Cannot attack with 0 power' };
  }
  inst._attacking = true;
  return { ok: true };
}

export function undeclareAttacker(side, slotIdx) {
  const inst = G[side]?.creatures?.[slotIdx];
  if (!inst) return { ok: false };
  delete inst._attacking;
  return { ok: true };
}

// Get all declared attackers as { slotIdx, inst }
export function getAttackers(side) {
  const slots = G[side]?.creatures || [];
  return slots
    .map((inst, idx) => (inst && inst._attacking) ? { slotIdx: idx, inst } : null)
    .filter(Boolean);
}

// Defender side assigns a blocker (or sets attacker to "unblocked")
// blockerSlotIdx === null means "go to face" (no block)
export function assignBlocker(defenderSide, attackerSide, attackerSlotIdx, blockerSlotIdx) {
  const attacker = G[attackerSide]?.creatures?.[attackerSlotIdx];
  if (!attacker || !attacker._attacking) {
    return { ok: false, error: 'No such attacker' };
  }
  if (blockerSlotIdx === null || blockerSlotIdx === undefined) {
    attacker._blockedBy = null; // explicitly unblocked
    return { ok: true };
  }
  const blocker = G[defenderSide]?.creatures?.[blockerSlotIdx];
  if (!blocker) return { ok: false, error: 'No blocker there' };
  if (blocker.exhausted || blocker.overexhausted) {
    return { ok: false, error: 'Blocker is exhausted' };
  }
  // Each blocker can only block one attacker — clear if used elsewhere
  for (const other of G[attackerSide]?.creatures || []) {
    if (other && other._blockedBy === blockerSlotIdx) {
      other._blockedBy = undefined;
    }
  }
  attacker._blockedBy = blockerSlotIdx;
  return { ok: true };
}

// Run all damage resolution. Returns array of damage events for animation.
export function resolveCombat(attackerSide, defenderSide) {
  const events = [];
  const attackers = getAttackers(attackerSide);

  for (const { slotIdx: aSlotIdx, inst: attacker } of attackers) {
    const aPow = getPower(attacker);
    const blockerSlotIdx = attacker._blockedBy;

    // Selfbleed on attack — add 1 to attacker's bleed pool by default
    // (cards with Selfbleed N: this is N; we use 1 as default, override per card)
    const selfbleedAmount = attacker.selfbleedOnAttack ?? 1;
    G[attackerSide].bleedPool = (G[attackerSide].bleedPool || 0) + selfbleedAmount;
    events.push({
      type: 'selfbleed',
      side: attackerSide,
      slotIdx: aSlotIdx,
      amount: selfbleedAmount,
      attackerName: attacker.name,
    });

    // Exhaust the attacker (all attackers exhaust, except Tireless — not implemented yet)
    attacker.exhausted = true;

    if (blockerSlotIdx === null || blockerSlotIdx === undefined) {
      // Unblocked — full damage to defender's Blood pool
      G[defenderSide].blood = Math.max(0, (G[defenderSide].blood || 0) - aPow);
      events.push({
        type: 'face-damage',
        attackerSide,
        defenderSide,
        attackerSlotIdx: aSlotIdx,
        attackerName: attacker.name,
        damage: aPow,
        defenderBloodAfter: G[defenderSide].blood,
      });
      continue;
    }

    // Blocked — compare powers
    const blocker = G[defenderSide].creatures[blockerSlotIdx];
    if (!blocker) {
      // Blocker disappeared somehow (shouldn't happen) — treat as unblocked
      G[defenderSide].blood = Math.max(0, (G[defenderSide].blood || 0) - aPow);
      events.push({
        type: 'face-damage',
        attackerSide, defenderSide,
        attackerSlotIdx: aSlotIdx,
        attackerName: attacker.name,
        damage: aPow,
        defenderBloodAfter: G[defenderSide].blood,
      });
      continue;
    }

    const bPow = getPower(blocker);
    const bSlotIdx = blockerSlotIdx;

    if (aPow > bPow) {
      // Attacker wins: blocker destroyed, excess does NOT go to face (Breaker not impl)
      events.push({
        type: 'combat-attacker-wins',
        attackerSide, defenderSide,
        attackerSlotIdx: aSlotIdx,
        blockerSlotIdx: bSlotIdx,
        attackerName: attacker.name,
        blockerName: blocker.name,
        attackerPower: aPow,
        blockerPower: bPow,
      });
      sacrificeCreature(defenderSide, bSlotIdx);
    } else if (aPow < bPow) {
      // Blocker wins: attacker destroyed
      events.push({
        type: 'combat-blocker-wins',
        attackerSide, defenderSide,
        attackerSlotIdx: aSlotIdx,
        blockerSlotIdx: bSlotIdx,
        attackerName: attacker.name,
        blockerName: blocker.name,
        attackerPower: aPow,
        blockerPower: bPow,
      });
      sacrificeCreature(attackerSide, aSlotIdx);
    } else {
      // Tie: both exhaust, neither destroyed
      blocker.exhausted = true;
      events.push({
        type: 'combat-tie',
        attackerSide, defenderSide,
        attackerSlotIdx: aSlotIdx,
        blockerSlotIdx: bSlotIdx,
        attackerName: attacker.name,
        blockerName: blocker.name,
        power: aPow,
      });
    }
  }

  // Clear all combat flags
  for (const side of ['player', 'ai']) {
    for (const c of G[side]?.creatures || []) {
      if (!c) continue;
      delete c._attacking;
      delete c._blockedBy;
    }
  }

  return events;
}

// Drain bleed pools as Blood damage. Run after combat resolves.
export function resolvePostBattle() {
  const events = [];
  for (const side of ['player', 'ai']) {
    const pool = G[side].bleedPool || 0;
    if (pool > 0) {
      G[side].blood = Math.max(0, (G[side].blood || 0) - pool);
      events.push({
        type: 'bleed-drain',
        side,
        amount: pool,
        bloodAfter: G[side].blood,
      });
      G[side].bleedPool = 0;
    }
  }
  return events;
}

// Check if anyone has won. Sets G.winner if so.
export function checkWinCondition() {
  if (G.winner) return G.winner;
  if ((G.player.blood || 0) <= 0 && (G.ai.blood || 0) <= 0) {
    G.winner = 'draw';
  } else if ((G.player.blood || 0) <= 0) {
    G.winner = 'ai';
  } else if ((G.ai.blood || 0) <= 0) {
    G.winner = 'player';
  }
  return G.winner;
}

// Helper: count unexhausted creatures with power > 0
export function countAvailableAttackers(side) {
  return (G[side]?.creatures || []).filter(c =>
    c && !c.exhausted && !c.overexhausted && getPower(c) > 0
  ).length;
}

// Helper: count unexhausted creatures (potential blockers)
export function countAvailableBlockers(side) {
  return (G[side]?.creatures || []).filter(c =>
    c && !c.exhausted && !c.overexhausted
  ).length;
}

// Simple AI: pick all unexhausted creatures with power > 0 as attackers
export function aiDeclareAllAttackers(side) {
  const slots = G[side]?.creatures || [];
  let count = 0;
  slots.forEach((inst, idx) => {
    if (inst && !inst.exhausted && !inst.overexhausted && getPower(inst) > 0) {
      inst._attacking = true;
      count++;
    }
  });
  return count;
}

// Simple AI: assign best blocker per attacker
// Strategy: for each attacker, find a defender creature that can either
// (a) destroy the attacker (defender power > attacker power), or
// (b) tie (defender power == attacker power)
// otherwise leave unblocked.
export function aiAssignBlockers(defenderSide, attackerSide) {
  const attackers = getAttackers(attackerSide);
  const usedBlockers = new Set();

  for (const { slotIdx: aSlotIdx, inst: attacker } of attackers) {
    const aPow = getPower(attacker);
    let bestSlot = null;
    let bestPow = -1;

    // Find defender that can win or tie
    (G[defenderSide]?.creatures || []).forEach((bInst, bSlotIdx) => {
      if (!bInst || bInst.exhausted || bInst.overexhausted) return;
      if (usedBlockers.has(bSlotIdx)) return;
      const bPow = getPower(bInst);
      if (bPow >= aPow && bPow > bestPow) {
        bestSlot = bSlotIdx;
        bestPow = bPow;
      }
    });

    // If no winning block, consider chump block to save Blood
    // Block if defender's Blood is low enough that the hit hurts more
    if (bestSlot === null) {
      const defenderBlood = G[defenderSide].blood || 0;
      if (aPow >= defenderBlood / 4) {
        // Chump-block — find lowest power creature to throw away
        let chumpSlot = null;
        let chumpPow = 99;
        (G[defenderSide]?.creatures || []).forEach((bInst, bSlotIdx) => {
          if (!bInst || bInst.exhausted || bInst.overexhausted) return;
          if (usedBlockers.has(bSlotIdx)) return;
          const bPow = getPower(bInst);
          if (bPow < chumpPow) {
            chumpSlot = bSlotIdx;
            chumpPow = bPow;
          }
        });
        if (chumpSlot !== null) bestSlot = chumpSlot;
      }
    }

    if (bestSlot !== null) {
      usedBlockers.add(bestSlot);
      attacker._blockedBy = bestSlot;
    } else {
      attacker._blockedBy = null;
    }
  }
}

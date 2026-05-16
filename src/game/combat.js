// ─────────────────────────────────────────────────────────────
// combat.js — Cybervamp v2 combat resolution
//
// PATCHED for keyword-patch session:
//   • Reads creature keywords (printed + granted) per RULES §6 + §7
//   • SELFBLEED X: triggers ONLY on creatures with the keyword (not all attackers)
//   • BLEED X: applies X bleed to defender on direct damage (unblocked OR breach overflow)
//   • BREACH: excess damage spills to defender (using blocker's BASE power per §6.2)
//   • TIRELESS: attacker does NOT exhaust on attack
//   • SIPHON: controller gains Blood per direct damage point dealt
//   • Ties go to ATTACKER (blocker dies) per §6.2
//   • All damage events carry damageSourceType per §17
//
// Still pending (future sessions):
//   • Support (supporters, Fortify, Breaker contributions)
//   • Walls (Wall Decay, can't attack/support)
//   • Hemorrhage triggered abilities
//   • Stack/priority windows during combat
// ─────────────────────────────────────────────────────────────

import { G } from './state.js';
import { sacrificeCreature } from './sacrifice.js';
import { getKeywords, hasKeyword, getKeywordValue } from './keywords.js';

// Effective power = base + permanent bonus + temp bonus (legacy paths).
// Kept for compatibility with existing window.getEffectivePower hook.
function getPower(inst) {
  if (!inst) return 0;
  if (typeof window !== 'undefined' && typeof window.getEffectivePower === 'function') {
    try { return window.getEffectivePower(inst); } catch (e) {}
  }
  return inst.power || 0;
}

// ───────── Attacker declaration ─────────

export function declareAttacker(side, slotIdx) {
  const inst = G[side]?.creatures?.[slotIdx];
  if (!inst) return { ok: false, error: 'No creature there' };
  if (inst.exhausted || inst.overexhausted) {
    return { ok: false, error: 'Creature is exhausted' };
  }
  if (getPower(inst) <= 0) {
    return { ok: false, error: 'Cannot attack with 0 power' };
  }
  // Walls cannot attack (per RULES §6.2 / §7)
  if (hasKeyword(inst, 'WALL')) {
    return { ok: false, error: 'Walls cannot attack' };
  }
  // Newly turned check (only enforced if instance was flagged on play; engine
  // may not be flagging this yet — TODO)
  if (inst._newlyTurned && !hasKeyword(inst, 'HASTE')) {
    return { ok: false, error: 'Creature has summoning sickness' };
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

export function getAttackers(side) {
  const slots = G[side]?.creatures || [];
  return slots
    .map((inst, idx) => (inst && inst._attacking) ? { slotIdx: idx, inst } : null)
    .filter(Boolean);
}

// ───────── Blocker assignment ─────────

export function assignBlocker(defenderSide, attackerSide, attackerSlotIdx, blockerSlotIdx) {
  const attacker = G[attackerSide]?.creatures?.[attackerSlotIdx];
  if (!attacker || !attacker._attacking) {
    return { ok: false, error: 'No such attacker' };
  }
  if (blockerSlotIdx === null || blockerSlotIdx === undefined) {
    attacker._blockedBy = null;
    return { ok: true };
  }
  const blocker = G[defenderSide]?.creatures?.[blockerSlotIdx];
  if (!blocker) return { ok: false, error: 'No blocker there' };
  if (blocker.exhausted || blocker.overexhausted) {
    return { ok: false, error: 'Blocker is exhausted' };
  }
  // Clear if used to block another attacker
  for (const other of G[attackerSide]?.creatures || []) {
    if (other && other._blockedBy === blockerSlotIdx) {
      other._blockedBy = undefined;
    }
  }
  attacker._blockedBy = blockerSlotIdx;
  return { ok: true };
}

// ───────── Damage helpers ─────────

/**
 * Deal direct damage to a player. Handles:
 *   • Blood loss
 *   • BLEED X application from the source creature
 *   • SIPHON gain on the source's controller
 *
 * sourceInst: the attacking creature (may have BLEED, SIPHON keywords)
 * sourceSide: side of the attacker
 * defenderSide: side of the defending player
 * amount: damage amount
 * breach: true if this damage came via Breach overflow
 * events: array to push events into
 */
function dealDirectDamageToPlayer(sourceInst, sourceSide, defenderSide, amount, breach, events) {
  if (amount <= 0) return;

  // 1. Apply Blood damage
  G[defenderSide].blood = Math.max(0, (G[defenderSide].blood || 0) - amount);
  events.push({
    type: 'face-damage',
    damageSourceType: 'combat',
    attackerSide: sourceSide,
    defenderSide,
    attackerSlotIdx: findCreatureSlot(sourceSide, sourceInst),
    attackerName: sourceInst?.name || 'Attacker',
    damage: amount,
    breach: !!breach,
    defenderBloodAfter: G[defenderSide].blood,
  });

  // 2. BLEED X — add X bleed to defender's pool (once per direct damage instance)
  const bleedValue = getKeywordValue(sourceInst, 'BLEED');
  if (bleedValue > 0) {
    G[defenderSide].bleedPool = (G[defenderSide].bleedPool || 0) + bleedValue;
    events.push({
      type: 'bleed-add',
      side: defenderSide,
      amount: bleedValue,
      source: sourceInst?.name || 'Attacker',
    });
  }

  // 3. SIPHON — controller gains Blood per damage point dealt
  if (hasKeyword(sourceInst, 'SIPHON')) {
    G[sourceSide].blood = (G[sourceSide].blood || 0) + amount;
    events.push({
      type: 'siphon-heal',
      side: sourceSide,
      amount,
      source: sourceInst?.name || 'Attacker',
    });
  }
}

function findCreatureSlot(side, inst) {
  if (!inst) return -1;
  const slots = G[side]?.creatures || [];
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] === inst) return i;
  }
  return -1;
}

// ───────── Main combat resolution ─────────

export function resolveCombat(attackerSide, defenderSide) {
  const events = [];
  const attackers = getAttackers(attackerSide);

  for (const { slotIdx: aSlotIdx, inst: attacker } of attackers) {
    const aPow = getPower(attacker);
    const blockerSlotIdx = attacker._blockedBy;

    // ── SELFBLEED on attack (only for creatures with the keyword) ──
    const selfbleedAmount = getKeywordValue(attacker, 'SELFBLEED');
    if (selfbleedAmount > 0) {
      G[attackerSide].bleedPool = (G[attackerSide].bleedPool || 0) + selfbleedAmount;
      events.push({
        type: 'selfbleed',
        side: attackerSide,
        slotIdx: aSlotIdx,
        amount: selfbleedAmount,
        attackerName: attacker.name,
      });
    }

    // ── Exhaust the attacker (unless TIRELESS per RULES §7) ──
    if (!hasKeyword(attacker, 'TIRELESS')) {
      attacker.exhausted = true;
    }

    if (blockerSlotIdx === null || blockerSlotIdx === undefined) {
      // Unblocked → all damage to defender's face
      dealDirectDamageToPlayer(attacker, attackerSide, defenderSide, aPow, false, events);
      continue;
    }

    const blocker = G[defenderSide].creatures[blockerSlotIdx];
    if (!blocker) {
      // Blocker disappeared mid-resolution → treat as unblocked
      dealDirectDamageToPlayer(attacker, attackerSide, defenderSide, aPow, false, events);
      continue;
    }

    const bPow = getPower(blocker);
    const bSlotIdx = blockerSlotIdx;

    // ── Combat resolution (attacker-favored, ties kill blocker per RULES §6.2) ──
    if (aPow >= bPow) {
      // Attacker wins or ties → blocker dies
      events.push({
        type: aPow > bPow ? 'combat-attacker-wins' : 'combat-tie-attacker-wins',
        attackerSide, defenderSide,
        attackerSlotIdx: aSlotIdx,
        blockerSlotIdx: bSlotIdx,
        attackerName: attacker.name,
        blockerName: blocker.name,
        attackerPower: aPow,
        blockerPower: bPow,
      });
      sacrificeCreature(defenderSide, bSlotIdx);

      // ── BREACH: excess damage spills to face ──
      // Per RULES §6.2: excess = attackerPower - blocker's BASE power
      // (Support contributions don't absorb Breach overflow.)
      if (hasKeyword(attacker, 'BREACH') && aPow > bPow) {
        const overflow = aPow - bPow;
        dealDirectDamageToPlayer(attacker, attackerSide, defenderSide, overflow, true, events);
      }
    } else {
      // Blocker wins: attacker dies
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

// ───────── Post-battle (bleed drain) ─────────

export function resolvePostBattle() {
  const events = [];
  for (const side of ['player', 'ai']) {
    const pool = G[side].bleedPool || 0;
    if (pool > 0) {
      G[side].blood = Math.max(0, (G[side].blood || 0) - pool);
      events.push({
        type: 'bleed-drain',
        damageSourceType: 'bleed',
        side,
        amount: pool,
        bloodAfter: G[side].blood,
      });
      G[side].bleedPool = 0;
    }
  }
  return events;
}

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

export function countAvailableAttackers(side) {
  return (G[side]?.creatures || []).filter(c =>
    c && !c.exhausted && !c.overexhausted && getPower(c) > 0 && !hasKeyword(c, 'WALL')
  ).length;
}

export function countAvailableBlockers(side) {
  return (G[side]?.creatures || []).filter(c =>
    c && !c.exhausted && !c.overexhausted
  ).length;
}

// AI: declare all eligible attackers
export function aiDeclareAllAttackers(side) {
  const slots = G[side]?.creatures || [];
  let count = 0;
  slots.forEach((inst, idx) => {
    if (!inst || inst.exhausted || inst.overexhausted) return;
    if (getPower(inst) <= 0) return;
    if (hasKeyword(inst, 'WALL')) return;
    inst._attacking = true;
    count++;
  });
  return count;
}

// AI: assign best blocker per attacker
export function aiAssignBlockers(defenderSide, attackerSide) {
  const attackers = getAttackers(attackerSide);
  const usedBlockers = new Set();

  for (const { slotIdx: aSlotIdx, inst: attacker } of attackers) {
    const aPow = getPower(attacker);
    let bestSlot = null;
    let bestPow = -1;

    // Prefer a blocker that wins or ties (note: ties FAVOR attacker now,
    // so a tie means blocker dies but absorbs damage. AI should consider this.)
    // For now, simple: prefer blocker with power >= attacker (defender survives or trades)
    (G[defenderSide]?.creatures || []).forEach((bInst, bSlotIdx) => {
      if (!bInst || bInst.exhausted || bInst.overexhausted) return;
      if (usedBlockers.has(bSlotIdx)) return;
      const bPow = getPower(bInst);
      // AI prefers strictly winning the trade (bPow > aPow) since ties now kill blocker
      if (bPow > aPow && bPow > bestPow) {
        bestSlot = bSlotIdx;
        bestPow = bPow;
      }
    });

    // Fallback: chump-block to save Blood if hit would be significant
    if (bestSlot === null) {
      const defenderBlood = G[defenderSide].blood || 0;
      if (aPow >= defenderBlood / 4) {
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

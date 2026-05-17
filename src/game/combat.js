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
import { getKeywords, hasKeyword, getKeywordValue, grantKeyword } from './keywords.js';
import { fireOnDirectDamage, fireOnKill } from './triggers.js';

// Effective power = base + permanent bonus + temp bonus (legacy paths).
// Kept for compatibility with existing window.getEffectivePower hook.
function getPower(inst) {
  if (!inst) return 0;
  let base = 0;
  if (typeof window !== 'undefined' && typeof window.getEffectivePower === 'function') {
    try { base = window.getEffectivePower(inst); } catch (e) { base = inst.power || 0; }
  } else {
    base = inst.power || 0;
  }
  return base + (inst._combatPowerBonus || 0);
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
  if (inst.newlyTurned && !hasKeyword(inst, 'HASTE')) {
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
  // BREAKER cannot be blocked by Wall creatures (RULES §7)
  if (hasKeyword(attacker, 'BREAKER') && hasKeyword(blocker, 'WALL')) {
    return { ok: false, error: 'Walls cannot block Breaker creatures' };
  }
  // _blockLimit: Left Behind and similar effects cap the number of blockers
  const blockLimit = G[defenderSide]._blockLimit;
  if (blockLimit !== undefined && blockLimit !== null) {
    const currentBlockerCount = (G[attackerSide]?.creatures || []).filter(
      c => c && c._blockedBy !== undefined && c._blockedBy !== null
    ).length;
    if (currentBlockerCount >= blockLimit) {
      return { ok: false, error: `Can only block with ${blockLimit} creature(s) this turn` };
    }
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

  // 2b. Bat tokens: each Bat orbiting the attacker adds 1 Bleed on direct damage (§9.3)
  const batCount = (sourceInst?.tokens || []).filter(t => t === 'Bat').length;
  if (batCount > 0) {
    G[defenderSide].bleedPool = (G[defenderSide].bleedPool || 0) + batCount;
    events.push({ type: 'bleed-add', side: defenderSide, amount: batCount, source: 'BatToken' });
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

  // 3b. Fenlily Seraphine: Zombie token hosts also gain Siphon while Fenlily is in play
  if (!hasKeyword(sourceInst, 'SIPHON')) {
    const hasFenlily = (G[sourceSide]?.creatures || []).some(c => c?.name === 'Fenlily Seraphine');
    if (hasFenlily && (sourceInst?.tokens || []).includes('Zombie')) {
      G[sourceSide].blood = (G[sourceSide].blood || 0) + amount;
      events.push({ type: 'siphon-heal', side: sourceSide, amount, source: 'FenlilySeraphine' });
    }
  }

  // 4. Lupine Countess passive: Wolf tokens add 1 Bleed per Wolf to direct damage
  const wolfCount = (sourceInst?.tokens || []).filter(t => t === 'Wolf').length;
  if (wolfCount > 0) {
    const hasLupine = (G[sourceSide]?.creatures || []).some(c => c?.name === 'Lupine Countess');
    if (hasLupine) {
      G[defenderSide].bleedPool = (G[defenderSide].bleedPool || 0) + wolfCount;
      events.push({ type: 'bleed-add', side: defenderSide, amount: wolfCount, source: 'LupineCountess' });
    }
  }

  // 5. ON_DIRECT_DAMAGE triggers (Werewolf Shaman, Rothollow, Grimoire Scribe, etc.)
  const srcSlot = findCreatureSlot(sourceSide, sourceInst);
  if (srcSlot >= 0) {
    fireOnDirectDamage(sourceSide, srcSlot, sourceInst, defenderSide, events);
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

  // ── Board-wide combat passives (applied before damage resolves) ──

  // Isolde, Veil Sovereign: when attacking, exhaust 2 random unexhausted enemy creatures
  const isoldeAttacking = attackers.find(a => a.inst.name === 'Isolde, Veil Sovereign');
  if (isoldeAttacking) {
    const available = (G[defenderSide]?.creatures || [])
      .map((c, i) => c && !c.exhausted && !c.overexhausted ? i : null)
      .filter(i => i !== null);
    for (let i = 0; i < 2 && i < available.length; i++) {
      const c = G[defenderSide].creatures[available[i]];
      c.exhausted = true;
      events.push({ type: 'exhaust', side: defenderSide, name: c.name, source: 'IsoldeVeilSovereign' });
    }
  }

  // Zane "Redline" Krov: all own attacking creatures gain Breach + Bleed:1
  const hasZane = (G[attackerSide]?.creatures || []).some(c => c?.name === 'Zane "Redline" Krov');
  if (hasZane) {
    for (const { inst: a } of attackers) {
      grantKeyword(a, 'BREACH', 'endOfTurn');
      grantKeyword(a, 'BLEED:1', 'endOfTurn');
    }
  }

  // Zyra Vex: while Zyra is attacking, ALL other own creatures get +1 power
  const zyraAttacking = attackers.some(a => a.inst.name === 'Zyra Vex');
  if (zyraAttacking) {
    for (const c of G[attackerSide]?.creatures || []) {
      if (c && c.name !== 'Zyra Vex') c._combatPowerBonus = (c._combatPowerBonus || 0) + 1;
    }
  }

  // Whetforge Adept: while attacking, other ATTACKING creatures get +1 power
  const whetforgeAttacking = attackers.some(a => a.inst.name === 'Whetforge Adept');
  if (whetforgeAttacking) {
    for (const { inst: a } of attackers) {
      if (a.name !== 'Whetforge Adept') a._combatPowerBonus = (a._combatPowerBonus || 0) + 1;
    }
  }

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
    // Zombie token OR Bloodnet Raver: becomes OVEREXHAUSTED instead of EXHAUSTED
    if (!hasKeyword(attacker, 'TIRELESS')) {
      const overExhaustOnAttack = (attacker.tokens || []).includes('Zombie')
                                || attacker.name === 'Bloodnet Raver';
      if (overExhaustOnAttack) {
        attacker.exhausted = true;
        attacker.overexhausted = true;
      } else {
        attacker.exhausted = true;
      }
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

    let bPow = getPower(blocker);
    // Elias Veyr: gains +2 effective power when blocking
    if (blocker.name === 'Elias Veyr') bPow += 2;
    const bSlotIdx = blockerSlotIdx;

    // Slashfang Sprinter: permanently gains BLEED:1 the first time it is blocked
    if (attacker.name === 'Slashfang Sprinter') {
      grantKeyword(attacker, 'BLEED:1', 'permanent');
    }

    const blockerIsWall = hasKeyword(blocker, 'WALL');

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
      fireOnKill(attackerSide, aSlotIdx, attacker, events);
      sacrificeCreature(defenderSide, bSlotIdx);

      // ── BREACH: excess damage spills to face ──
      if (hasKeyword(attacker, 'BREACH') && aPow > bPow) {
        const overflow = aPow - bPow;
        dealDirectDamageToPlayer(attacker, attackerSide, defenderSide, overflow, true, events);
      }
    } else if (blockerIsWall) {
      // Wall blocks: walls deal no combat damage (§6.4) — attacker survives.
      // Wall takes decay at End Phase; track it here.
      blocker._blockedThisTurn = true;
      events.push({
        type: 'combat-wall-blocked',
        attackerSide, defenderSide,
        attackerSlotIdx: aSlotIdx,
        blockerSlotIdx: bSlotIdx,
        attackerName: attacker.name,
        blockerName: blocker.name,
        attackerPower: aPow,
        blockerPower: bPow,
      });
    } else {
      // Blocker wins: attacker dies; mark blocker for EOT effects (Wall Decay, Marble Sentinel)
      blocker._blockedThisTurn = true;
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

    // ── Post-combat blocker overexhaust effects ──
    // Salizer Shade / Elowen Thornveil: blocker (if still alive) becomes overexhausted
    const overexhaustsBlocker = attacker.name === 'Salizer Shade'
                             || attacker.name === 'Elowen Thornveil';
    if (overexhaustsBlocker) {
      const survivingBlocker = G[defenderSide].creatures[bSlotIdx];
      if (survivingBlocker) {
        survivingBlocker.exhausted = true;
        survivingBlocker.overexhausted = true;
        events.push({ type: 'overexhaust', side: defenderSide, name: survivingBlocker.name, source: attacker.name });
      }
    }
  }

  // Isolde, Veil Sovereign: overexhausts herself after combat (if still alive)
  if (isoldeAttacking) {
    const isoldeInst = isoldeAttacking.inst;
    if ((G[attackerSide]?.creatures || []).includes(isoldeInst)) {
      isoldeInst.overexhausted = true;
      events.push({ type: 'overexhaust', side: attackerSide, name: isoldeInst.name, source: 'self' });
    }
  }

  // Clear all combat flags, temp bonuses, and per-combat limits
  for (const side of ['player', 'ai']) {
    for (const c of G[side]?.creatures || []) {
      if (!c) continue;
      delete c._attacking;
      delete c._blockedBy;
      delete c._combatPowerBonus;
    }
    // Clear block-limit imposed by Left Behind / similar effects
    delete G[side]._blockLimit;
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
    c && !c.exhausted && !c.overexhausted && getPower(c) > 0 &&
    !hasKeyword(c, 'WALL') && !(c.newlyTurned && !hasKeyword(c, 'HASTE'))
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
    if (inst.newlyTurned && !hasKeyword(inst, 'HASTE')) return;
    inst._attacking = true;
    count++;
  });
  return count;
}

// AI: assign best blocker per attacker
export function aiAssignBlockers(defenderSide, attackerSide) {
  const attackers = getAttackers(attackerSide);
  const usedBlockers = new Set();
  // Respect _blockLimit (Left Behind etc.)
  const blockLimit = G[defenderSide]._blockLimit;

  for (const { slotIdx: aSlotIdx, inst: attacker } of attackers) {
    // Stop assigning blockers if block limit is reached
    if (blockLimit !== undefined && blockLimit !== null && usedBlockers.size >= blockLimit) {
      attacker._blockedBy = null;
      continue;
    }

    const aPow = getPower(attacker);
    const attackerHasBreaker = hasKeyword(attacker, 'BREAKER');
    let bestSlot = null;
    let bestPow = -1;

    // Prefer a blocker that wins or ties (note: ties FAVOR attacker now,
    // so a tie means blocker dies but absorbs damage. AI should consider this.)
    // For now, simple: prefer blocker with power >= attacker (defender survives or trades)
    (G[defenderSide]?.creatures || []).forEach((bInst, bSlotIdx) => {
      if (!bInst || bInst.exhausted || bInst.overexhausted) return;
      if (usedBlockers.has(bSlotIdx)) return;
      // Walls cannot block Breaker creatures (RULES §7)
      if (attackerHasBreaker && hasKeyword(bInst, 'WALL')) return;
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
          // Walls cannot block Breaker creatures
          if (attackerHasBreaker && hasKeyword(bInst, 'WALL')) return;
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

// ─────────────────────────────────────────────────────────────
// relics.js — Relic permanent management
//
// Relics are a third permanent type alongside creatures.
// They occupy their own row of 4 slots per side.
// They don't attack or block — they're passive permanents.
// Cost is paid like creatures (gold + blood from card).
//
// State shape (added defensively):
//   G.player.relics = [null, null, null, null]
//   G.ai.relics = [null, null, null, null]
//
// If state.js doesn't initialize these, ensureRelicSlots() does it.
// ─────────────────────────────────────────────────────────────

import { G } from './state.js';

const RELIC_SLOT_COUNT = 4;

export function ensureRelicSlots(side) {
  if (!G[side].relics || !Array.isArray(G[side].relics)) {
    G[side].relics = new Array(RELIC_SLOT_COUNT).fill(null);
  }
  // Pad if shorter than expected
  while (G[side].relics.length < RELIC_SLOT_COUNT) {
    G[side].relics.push(null);
  }
}

export function isRelicBoardFull(side) {
  ensureRelicSlots(side);
  return G[side].relics.every(s => s !== null && s !== undefined);
}

export function getEmptyRelicSlotIdx(side) {
  ensureRelicSlots(side);
  return G[side].relics.findIndex(s => s === null || s === undefined);
}

// Play a relic from hand. Pays the cost manually; doesn't go through
// flow.js's playCardFromHand which assumes creatures.
//
// Returns { ok, error, slotIdx? }
export function playRelicFromHand(side, instId) {
  ensureRelicSlots(side);

  const hand = G[side].hand;
  if (!Array.isArray(hand)) return { ok: false, error: 'No hand' };
  const handIdx = hand.findIndex(c => c.instId === instId);
  if (handIdx === -1) return { ok: false, error: 'Card not in hand' };
  const inst = hand[handIdx];

  // Verify it's a relic-type card
  const isRelic = ['Relic', 'relic', 'Permanent', 'permanent'].includes(inst.type);
  if (!isRelic) return { ok: false, error: `${inst.type} is not a relic` };

  // Check costs
  const goldCost = inst.goldCost || 0;
  const bloodCost = inst.bloodCost || 0;
  if ((G[side].gold || 0) < goldCost) {
    return { ok: false, error: `Need ${goldCost} gold (have ${G[side].gold || 0})` };
  }
  if ((G[side].blood || 0) <= bloodCost) {
    return { ok: false, error: `Cannot pay ${bloodCost} blood (would die)` };
  }

  // Find empty slot
  const slotIdx = getEmptyRelicSlotIdx(side);
  if (slotIdx === -1) return { ok: false, error: 'Relic slots full — sacrifice first' };

  // Pay costs
  G[side].gold = (G[side].gold || 0) - goldCost;
  if (bloodCost > 0) {
    G[side].blood = (G[side].blood || 0) - bloodCost;
  }

  // Remove from hand, place in relic slot
  hand.splice(handIdx, 1);
  G[side].relics[slotIdx] = inst;

  // Mark as in-play so it doesn't get attacked etc.
  inst._inPlay = true;
  inst._relicSlot = slotIdx;

  // Log
  window._battleLog = window._battleLog || [];
  const owner = side === 'player' ? 'You' : 'AI';
  window._battleLog.push(`${owner} played relic ${inst.name}`);

  return { ok: true, slotIdx };
}

// Sacrifice a relic in a specific slot (for replacement when full)
export function sacrificeRelic(side, slotIdx) {
  ensureRelicSlots(side);
  const inst = G[side].relics[slotIdx];
  if (!inst) return { ok: false, error: 'No relic there' };

  if (Array.isArray(G[side].discard)) {
    G[side].discard.push(inst);
  }
  G[side].relics[slotIdx] = null;

  window._battleLog = window._battleLog || [];
  const owner = side === 'player' ? 'You' : 'AI';
  window._battleLog.push(`${owner} sacrificed relic ${inst.name}`);

  return { ok: true, sacrificed: inst };
}

// Check if a card is a relic type
export function isRelicCard(inst) {
  return ['Relic', 'relic', 'Permanent', 'permanent'].includes(inst.type);
}

// AI: simple relic play logic
// Plays first available relic in hand if it has gold/space
export function aiTryPlayRelic(side) {
  ensureRelicSlots(side);
  const hand = G[side].hand || [];
  for (const inst of hand) {
    if (!isRelicCard(inst)) continue;
    const result = playRelicFromHand(side, inst.instId);
    if (result.ok) return { ok: true, played: inst };
  }
  return { ok: false };
}

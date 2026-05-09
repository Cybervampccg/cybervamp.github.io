// ─────────────────────────────────────────────────────────────
// sacrifice.js — Destroy a creature in a slot
//
// Used when:
//   - Player plays a creature with all slots full (sacrifice for replacement)
//   - Future: damage destroys a creature, spell destroys a creature
//
// This function intentionally does NOT call into flow.js to avoid
// circular dependencies. It mutates G directly and logs the event.
// Death triggers (e.g. "When this card is destroyed, create 1 Bat token")
// will be handled in a future combat session — for now, the card is
// simply moved from the slot to the discard pile.
// ─────────────────────────────────────────────────────────────

import { G } from './state.js';

export function sacrificeCreature(side, slotIdx) {
  const inst = G[side]?.creatures?.[slotIdx];
  if (!inst) return { ok: false, error: 'No creature in that slot' };

  // Move to discard pile if it exists, otherwise just remove
  if (Array.isArray(G[side].discard)) {
    G[side].discard.push(inst);
  }

  // Clear the slot
  G[side].creatures[slotIdx] = null;

  // Log
  window._battleLog = window._battleLog || [];
  const owner = side === 'player' ? 'You' : 'AI';
  window._battleLog.push(`${owner} sacrificed ${inst.name}`);

  return { ok: true, sacrificed: inst };
}

// Helper: are all creature slots filled?
export function isCreatureBoardFull(side) {
  const slots = G[side]?.creatures;
  if (!slots) return false;
  return slots.every(s => s !== null && s !== undefined);
}

// Helper: discard a card from hand (returns it to discard pile)
export function discardFromHand(side, instId) {
  const hand = G[side]?.hand;
  if (!Array.isArray(hand)) return { ok: false, error: 'No hand found' };
  const idx = hand.findIndex(c => c.instId === instId);
  if (idx === -1) return { ok: false, error: 'Card not in hand' };
  const [removed] = hand.splice(idx, 1);
  if (Array.isArray(G[side].discard)) {
    G[side].discard.push(removed);
  }
  window._battleLog = window._battleLog || [];
  const owner = side === 'player' ? 'You' : 'AI';
  window._battleLog.push(`${owner} discarded ${removed.name}`);
  return { ok: true, discarded: removed };
}

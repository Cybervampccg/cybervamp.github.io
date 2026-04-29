// ─────────────────────────────────────────────────────────────
// Game flow — turn cycling, phase transitions, card play
//
// Session C scope: skip combat phase entirely.
// renew → main → end → next player's renew.
// ─────────────────────────────────────────────────────────────

import { G, drawCards, grantTurnGold, endTurnCleanup, findEmptySlot } from './state.js';

const HAND_CAP = 7;

// Begin a player's turn
export function beginTurn(who) {
  G.activePlayer = who;
  G.phase = 'renew';

  const side = G[who];

  // Recover exhaust states
  for (const inst of [...side.creatures, ...side.relics]) {
    if (!inst) continue;
    if (inst.exhaustState === 'overexhausted') inst.exhaustState = 'exhausted';
    else if (inst.exhaustState === 'exhausted') inst.exhaustState = 'renewed';
    inst.newlyTurned = false;
  }

  // Grant gold
  grantTurnGold(who);

  // Draw 2 (skip on turn 1's first action — initial hand was 5)
  if (G.turn > 1 || who === 'ai') {
    drawCards(who, 2);
  }

  G.phase = 'main';
}

// End the active player's turn cleanly
export function endTurn() {
  const who = G.activePlayer;
  G.phase = 'end';

  // Discard down to hand cap (rule: enforced at end of turn)
  const side = G[who];
  while (side.hand.length > HAND_CAP) {
    const dumped = side.hand.shift();  // discard from front (oldest)
    dumped.location = 'discard';
    side.discard.push(dumped);
  }

  endTurnCleanup(who);

  if (G.winner) return;

  const nextWho = who === 'player' ? 'ai' : 'player';
  if (nextWho === 'player') G.turn += 1;
  beginTurn(nextWho);
}

// Play a creature/relic from hand into a board slot.
export function playCardFromHand(inst) {
  const who = inst.owner;
  const side = G[who];

  if (inst.location !== 'hand') return { ok: false, error: 'Card not in hand' };
  if (G.activePlayer !== who) return { ok: false, error: 'Not your turn' };
  if (G.phase !== 'main') return { ok: false, error: 'Can only play during main phase' };
  if (side.gold < inst.goldCost) return { ok: false, error: 'Not enough gold' };
  if (side.blood <= inst.bloodCost) return { ok: false, error: 'Not enough blood (would die)' };
  if (inst.type === 'Spell') return { ok: false, error: 'Spells not yet implemented' };

  const slotIdx = findEmptySlot(side, inst.type);
  if (slotIdx < 0) return { ok: false, error: `No empty ${inst.type.toLowerCase()} slot` };

  // Pay cost
  side.gold -= inst.goldCost;
  side.blood -= inst.bloodCost;
  if (side.blood <= 0) G.winner = who === 'player' ? 'ai' : 'player';

  // Remove from hand
  const handIdx = side.hand.findIndex(i => i.instId === inst.instId);
  if (handIdx >= 0) side.hand.splice(handIdx, 1);

  // Place
  inst.location = inst.type === 'Creature' ? 'creatures' : 'relics';
  inst.slotIdx = slotIdx;
  if (inst.type === 'Creature') {
    side.creatures[slotIdx] = inst;
    inst.newlyTurned = true;
  } else {
    side.relics[slotIdx] = inst;
  }

  G.stats.cardsPlayed[who] += 1;

  return { ok: true };
}

// Can the player afford this card right now?
export function canAffordInst(inst) {
  const side = G[inst.owner];
  return side.gold >= inst.goldCost && side.blood > inst.bloodCost;
}

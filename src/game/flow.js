// ─────────────────────────────────────────────────────────────
// Game flow — turn cycling, phase transitions, card play
//
// Session C scope: skip combat phase entirely.
// renew → main → end → next player's renew.
// ─────────────────────────────────────────────────────────────

import { G, drawCards, grantTurnGold, endTurnCleanup, findEmptySlot } from './state.js';
import { hasKeyword } from './keywords.js';

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

  // Bleed resolution and cleanup run first (§3.5 order: cleanup → bleed → … → hand cap)
  endTurnCleanup(who);

  if (G.winner) return;

  // Hand size check is AFTER bleed resolution per §3.5
  const side = G[who];
  while (side.hand.length > HAND_CAP) {
    const dumped = side.hand.shift();  // discard from front (oldest)
    dumped.location = 'discard';
    side.discard.push(dumped);
  }

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
  // Relic Scribe: while in play and unexhausted, relics and walls cost 1 less gold
  let effectiveGoldCost = inst.goldCost;
  const hasRelicScribe = (side.creatures || []).some(c =>
    c && c.name === 'Relic Scribe' && !c.exhausted && !c.overexhausted
  );
  if (hasRelicScribe) {
    const isRelic = inst.type === 'Relic';
    const isWall = inst.type === 'Creature' && hasKeyword(inst, 'WALL');
    if (isRelic || isWall) effectiveGoldCost = Math.max(0, effectiveGoldCost - 1);
  }

  if (side.gold < effectiveGoldCost) return { ok: false, error: 'Not enough gold' };
  if (side.blood <= inst.bloodCost) return { ok: false, error: 'Not enough blood (would die)' };
  if (inst.type === 'Spell') return { ok: false, error: 'Spells not yet implemented' };

  const slotIdx = findEmptySlot(side, inst.type);
  if (slotIdx < 0) return { ok: false, error: `No empty ${inst.type.toLowerCase()} slot` };

  // Pay cost
  side.gold -= effectiveGoldCost;
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
  const who = inst.owner;
  const side = G[who];
  let effectiveGoldCost = inst.goldCost;
  const hasRelicScribe = (side.creatures || []).some(c =>
    c && c.name === 'Relic Scribe' && !c.exhausted && !c.overexhausted
  );
  if (hasRelicScribe) {
    const isRelic = inst.type === 'Relic';
    const isWall = inst.type === 'Creature' && hasKeyword(inst, 'WALL');
    if (isRelic || isWall) effectiveGoldCost = Math.max(0, effectiveGoldCost - 1);
  }
  return side.gold >= effectiveGoldCost && side.blood > inst.bloodCost;
}

// ─────────────────────────────────────────────────────────────
// AI opponent — minimal Session C version
//
// Plays the most expensive affordable creature each turn, then ends.
// No combat, no abilities, no spells yet.
// ─────────────────────────────────────────────────────────────

import { G } from './state.js';
import { playCardFromHand, endTurn, canAffordInst } from './flow.js';

export async function runAiTurn(opts = {}) {
  const onAction = opts.onAction || (() => {});
  const stepDelayMs = opts.stepDelayMs || 700;

  await sleep(stepDelayMs);

  // Keep playing creatures while we have gold + slots
  let safetyCounter = 0;
  while (safetyCounter++ < 8) {
    if (!hasEmptyCreatureSlot()) break;

    const playable = G.ai.hand
      .filter(c => c.type === 'Creature')
      .filter(c => canAffordInst(c))
      .sort((a, b) => (b.goldCost + b.bloodCost) - (a.goldCost + a.bloodCost));

    if (playable.length === 0) break;

    const result = playCardFromHand(playable[0]);
    if (!result.ok) break;
    onAction({ type: 'play', card: playable[0] });
    await sleep(stepDelayMs);
  }

  await sleep(stepDelayMs / 2);
  endTurn();
  onAction({ type: 'endTurn' });
}

function hasEmptyCreatureSlot() {
  return G.ai.creatures.some(s => s === null);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

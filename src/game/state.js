// Battle state — built in a future session
// See design doc 07-keyword-transition.md for the planned shape.

// Will export:
//   makeInitialState(playerFaction, aiFaction) → G object
//   makeInst(cardId, owner) → instance with fresh keywords/state
//   getEffectivePower(inst) → base + token bonuses + powerMods
//   etc.

export function makeInitialState() {
  console.warn('[state] makeInitialState — not yet implemented');
  return null;
}

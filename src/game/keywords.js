// Keyword parser + checker
// Will replace the giant parseKeywords function from old build with a
// cleaner version aware of the new rules:
//   - No mana-pool keywords (no R/W/B/P pip costs in abilities)
//   - Selfbleed timing tightened (only on attack/ability-exhaust)
//   - Bleed/Selfbleed context-aware parsing (ignores "gain Bleed +1" descriptive)
//   - Haste descriptive-clause check (ignores "create token with Haste")

export function parseKeywords(abilityText) {
  console.warn('[keywords] parseKeywords — not yet implemented');
  return {};
}

export function hasKeyword(inst, kw) {
  return !!(inst.keywords?.[kw] || inst.tempKeywords?.[kw]);
}

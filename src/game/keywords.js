// ─────────────────────────────────────────────────────────────
// keywords.js — runtime keyword helpers
//
// All keyword lookups go through these helpers so the engine reads
// the union of (printed keywords) ∪ (granted keywords) ∪ (modifications).
//
// Lazy parsing: if a card instance arrives without a `keywords` array,
// we auto-extract from its ability text on first access. This means
// the engine works without any entry-point wiring — existing cards.js
// data needs no modification.
// ─────────────────────────────────────────────────────────────

import { extractKeywords } from './keyword-parser.js';

// Internal cache of printed keywords per card-instance. Cards in cards.js
// often share the same OBJECT reference across all instances of the same
// card, so caching on the card object directly works once per card.
function ensurePrintedKeywords(inst) {
  if (!inst) return [];
  if (Array.isArray(inst.keywords)) return inst.keywords;
  // Lazy-parse from ability text
  const text =
    inst.ability ||
    inst.abilities ||
    inst.abilityText ||
    inst.text ||
    '';
  if (typeof text !== 'string' || text.length === 0) {
    try { inst.keywords = []; } catch (e) { /* frozen object */ }
    return [];
  }
  const { keywords } = extractKeywords(text);
  try {
    inst.keywords = keywords;
  } catch (e) {
    // Frozen card object — just return the parsed result without caching.
    // (This means every getKeywords call re-parses; minor perf hit, no bug.)
  }
  return keywords;
}

/**
 * Returns the effective set of keyword strings on this in-play instance.
 * Combines printed (`inst.keywords`, auto-parsed if missing) with
 * runtime-granted (`inst._grantedKeywords`).
 */
export function getKeywords(inst) {
  if (!inst) return [];
  const printed = ensurePrintedKeywords(inst);
  const granted = Array.isArray(inst._grantedKeywords)
    ? inst._grantedKeywords.map(g => g.keyword)
    : [];
  return [...printed, ...granted];
}

/**
 * Check whether the instance has a specific keyword (bare flag).
 * For value keywords, checks if the BASE name exists (any value).
 *
 * hasKeyword(inst, 'HASTE')      → true if inst has 'HASTE' anywhere
 * hasKeyword(inst, 'BLEED')      → true if inst has any 'BLEED:X'
 */
export function hasKeyword(inst, name) {
  if (!inst || !name) return false;
  const target = name.toUpperCase();
  return getKeywords(inst).some(kw => {
    const base = kw.split(':')[0].toUpperCase();
    return base === target;
  });
}

/**
 * Get the numeric value of a value-bearing keyword (BLEED, SELFBLEED).
 * Returns the SUM of all printed + granted values, then applies modifiers.
 *
 * For BLEED, also applies _bleedBonus (additive) and _bleedMultiplier (multiplicative).
 * For SELFBLEED, returns raw sum (no modifier system for selfbleed yet).
 *
 * Returns 0 if the keyword is not present.
 */
export function getKeywordValue(inst, name) {
  if (!inst) return 0;
  const target = name.toUpperCase();
  let total = 0;
  let present = false;

  for (const kw of getKeywords(inst)) {
    const [base, val] = kw.split(':');
    if (base.toUpperCase() === target) {
      present = true;
      total += parseInt(val || '0', 10);
    }
  }

  if (!present) return 0;

  // Apply BLEED modifiers (per RULES §7 + Blade Silhouette mechanic)
  if (target === 'BLEED') {
    if (typeof inst._bleedBonus === 'number') total += inst._bleedBonus;
    if (typeof inst._bleedMultiplier === 'number') total *= inst._bleedMultiplier;
  }

  return total;
}

/**
 * Add a granted keyword to an instance.
 *
 * keyword: string, e.g. 'BREACH' or 'BLEED:1'
 * duration: 'endOfTurn' | 'permanent'
 *
 * Special case: granting 'BLEED:N' should be expressed via setBleedBonus
 * if you want it to STACK additively with printed BLEED. If you grant
 * a BLEED:N as a separate keyword entry, it adds to the sum independently.
 * Both paths work for the value computation in getKeywordValue.
 */
export function grantKeyword(inst, keyword, duration = 'endOfTurn') {
  if (!inst || !keyword) return;
  if (!inst._grantedKeywords) inst._grantedKeywords = [];
  inst._grantedKeywords.push({ keyword, duration });
}

/**
 * Set or modify the bleed bonus / multiplier on a creature.
 *
 * op: 'add' | 'multiply' | 'set'
 * value: numeric
 *
 * Used by spells like "Bleed +1 until end of turn" (op='add', value=1)
 * and "Bleed is doubled" (op='multiply', value=2).
 *
 * Both fields are cleared on EOT cleanup.
 */
export function modifyBleedValue(inst, op, value) {
  if (!inst) return;
  if (op === 'add') {
    inst._bleedBonus = (inst._bleedBonus || 0) + value;
  } else if (op === 'multiply') {
    inst._bleedMultiplier = (inst._bleedMultiplier || 1) * value;
  } else if (op === 'set') {
    inst._bleedBonus = value;
  }
}

/**
 * Clear all end-of-turn granted keywords and bleed modifiers from an instance.
 * Permanent grants stay.
 *
 * Called by renewPermanents at the start of the owning side's turn,
 * after the previous turn's EOT effects have expired.
 */
export function clearTempKeywords(inst) {
  if (!inst) return;
  if (Array.isArray(inst._grantedKeywords)) {
    inst._grantedKeywords = inst._grantedKeywords.filter(g => g.duration === 'permanent');
    if (inst._grantedKeywords.length === 0) delete inst._grantedKeywords;
  }
  delete inst._bleedBonus;
  delete inst._bleedMultiplier;
}

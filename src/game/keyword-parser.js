// ─────────────────────────────────────────────────────────────
// keyword-parser.js
//
// Scans the free-text `ability` / `abilities` field on cards and
// extracts structured printed keywords into a `keywords: [...]` array.
//
// Why this exists:
//   The CSV/cards.js has only free-text ability descriptions.
//   The engine needs structured data (HASTE, BLEED:1, SELFBLEED:2, etc.)
//   to apply mechanics during combat.
//
// What this DOES extract:
//   - Static keyword flags: HASTE, TIRELESS, BREACH, SIPHON, BREAKER, FORTIFY, WALL
//   - Numeric-valued keywords: BLEED:X, SELFBLEED:X
//   - Triggered ability presence: marks `_hasComplexAbility` if text contains
//     {Exhaust}:, {Overexhaust}:, Sac:, Pitch:, "On Attack:", "On Death:", "Hemorrhage:"
//
// What this does NOT extract:
//   - Full structured abilities (e.g. "Overexhaust: Gain control of target...")
//     Those still require hand-coded entries in card-effects.js.
//   - Spell effects — spells stay in card-effects.js as before.
//   - Cost prefixes like {R}{Exhaust}: — used by hand-coded entries.
//
// Usage:
//   import { extractKeywords, augmentCardDatabase } from './keyword-parser.js';
//   augmentCardDatabase(cardArray);  // mutates each card to add `.keywords`
// ─────────────────────────────────────────────────────────────

// Regexes for static keyword detection.
// Each entry: { pattern, emit }
// - pattern: RegExp tested against the ability text
// - emit: either a string keyword to push, OR a function(match) → keyword string

const KEYWORD_PATTERNS = [
  // Static keywords — case-insensitive whole-word match
  { pattern: /\bHaste\b/i,    emit: 'HASTE' },
  { pattern: /\bTireless\b/i, emit: 'TIRELESS' },
  { pattern: /\bBreach\b/i,   emit: 'BREACH' },
  { pattern: /\bSiphon\b/i,   emit: 'SIPHON' },
  { pattern: /\bBreaker\b/i,  emit: 'BREAKER' },
  { pattern: /\bFortify\b/i,  emit: 'FORTIFY' },

  // Wall — subtype flag. Detected when it appears as a standalone keyword,
  // not when used as a target ("destroy target Wall creature").
  // Accepts: "Wall", "Wall, ...", "Fortify, Wall", "...\nWall"
  // Rejects: "target Wall creature", "destroy ... Wall", "all Walls"
  {
    pattern: /(?:^|[\n.,]|\s)Wall(?=[\s,.\n]|$)(?!.*\bcreature\b)/i,
    emit: 'WALL',
  },

  // Numeric: Bleed N (printed creature keyword, NOT "Bleed +N" which is a grant)
  // We want "Bleed 2" but not "Bleed +2" (the latter is a temporary grant in spells)
  // Negative lookahead for + before the digit.
  {
    pattern: /\bBleed\s+(?!\+)(\d+)\b/i,
    emit: (m) => `BLEED:${parseInt(m[1], 10)}`,
  },

  // Numeric: Selfbleed N
  {
    pattern: /\bSelfbleed\s+(\d+)\b/i,
    emit: (m) => `SELFBLEED:${parseInt(m[1], 10)}`,
  },
];

// Detects whether a card has activated/triggered abilities the parser CAN'T
// auto-extract (still need hand-coded entries in card-effects.js).
const COMPLEX_ABILITY_MARKERS = [
  /\{Exhaust\}\s*:/i,
  /\{Overexhaust\}\s*:/i,
  /\bSac\s*:/i,
  /\bPitch\s*:/i,
  /\bHemorrhage\s*:/i,
  /On\s+(?:Attack|Death|Damage|Play|Block)\s*:/i,
  // Cost-prefixed activated abilities like {R}{Exhaust}:
  /\{[RWBPGC]\}\s*\{(?:Exhaust|Overexhaust)\}\s*:/i,
];

/**
 * Extract keywords from a card's ability text.
 * Returns { keywords: string[], hasComplexAbility: boolean }
 */
export function extractKeywords(abilityText) {
  if (!abilityText || typeof abilityText !== 'string') {
    return { keywords: [], hasComplexAbility: false };
  }

  const keywords = new Set();

  for (const { pattern, emit } of KEYWORD_PATTERNS) {
    const match = abilityText.match(pattern);
    if (!match) continue;
    const value = typeof emit === 'function' ? emit(match) : emit;
    if (value) keywords.add(value);
  }

  // Filter out invalid SELFBLEED:0 / BLEED:0 from being counted as useless flags
  // (we keep them — a designer-set 0 means "no current bleed", which can be
  // increased by Bleed +1 effects later. Treat them as present-but-zero.)

  const hasComplexAbility = COMPLEX_ABILITY_MARKERS.some(p => p.test(abilityText));

  return {
    keywords: [...keywords],
    hasComplexAbility,
  };
}

/**
 * Mutate every card in `cards` to have a `keywords` array (and `_hasComplexAbility`
 * flag). Idempotent: skips cards that already have keywords arrays.
 *
 * Reads from card.ability (singular) OR card.abilities (string OR array).
 * Writes to card.keywords (array of strings).
 */
export function augmentCardDatabase(cards) {
  if (!Array.isArray(cards)) return;
  for (const card of cards) {
    if (!card) continue;
    if (Array.isArray(card.keywords) && card.keywords.length > 0) continue; // already structured

    // Get the ability text from whatever field exists
    const text = getAbilityText(card);
    const { keywords, hasComplexAbility } = extractKeywords(text);
    card.keywords = keywords;
    card._hasComplexAbility = hasComplexAbility;
  }
}

function getAbilityText(card) {
  // Try common field names
  if (typeof card.ability === 'string') return card.ability;
  if (typeof card.abilities === 'string') return card.abilities;
  if (typeof card.abilityText === 'string') return card.abilityText;
  if (typeof card.text === 'string') return card.text;
  // If abilities is an array of structured objects, no free-text to parse
  return '';
}

// ─── Debugging helpers ───

/**
 * For developer/console debugging: log a summary of what was extracted.
 */
export function debugKeywordExtraction(cards) {
  const summary = { byKeyword: {}, totalParsed: 0, withComplex: 0 };
  for (const card of cards) {
    if (!card?.keywords) continue;
    summary.totalParsed++;
    if (card._hasComplexAbility) summary.withComplex++;
    for (const kw of card.keywords) {
      const base = kw.split(':')[0];
      summary.byKeyword[base] = (summary.byKeyword[base] || 0) + 1;
    }
  }
  return summary;
}

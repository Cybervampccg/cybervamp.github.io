// ─────────────────────────────────────────────────────────────
// Keyword parser + checker
//
// Parses ability text into a flat object of standing keywords.
// Context-aware: ignores keywords appearing inside ability costs,
// triggered clauses, and "create token with X" descriptive text.
//
// Standing keywords supported:
//   bleed:N          (Bleed N — applies N bleed when this hits opponent)
//   selfBleed:N      (Selfbleed N — N bleed to controller on attack/ability)
//   haste            (can attack the turn it's played)
//   tireless         (attacking does not exhaust)
//   breach           (excess damage hits opponent)
//   wall             (cannot attack/support, loses 1 power per block)
//   siphon           (gain blood per direct damage)
//   breaker          (ignores supporters when calculating defense)
//   fortify          (each supporter gives +2 power instead of +1)
//
// See design doc 05-rules-final.md and 07-keyword-transition.md.
// ─────────────────────────────────────────────────────────────

export function parseKeywords(abilityText) {
  const t = (abilityText || '').toLowerCase();
  const kw = {};
  if (!t) return kw;

  // ── Haste — only as a standing keyword, not when describing a token/copy ──
  if (t.includes('haste')) {
    const idx = t.indexOf('haste');
    const before = t.substring(0, idx);
    const isDescriptive =
      /\b(has|have|gains?|with|having)\s+$/i.test(before) ||
      /\b(it|token|copy|they|each)\b[^,\n]*\s(has|gains?|with)\s+$/i.test(before);
    const isConditional = before.includes(': ') && (
      before.includes('if ') || before.includes('when ') ||
      before.includes('target of') || before.includes('targeted') ||
      before.includes('make a copy') || before.includes('create')
    );
    if (!isDescriptive && !isConditional) kw.haste = true;
  }

  // ── Tireless ──
  if (/\btireless\b/.test(t)) kw.tireless = true;

  // ── Breach — only when clearly a standing keyword ──
  if (/\bbreach\b/.test(t)) {
    // Exclude "may breach" or "after breach" etc. Most cards just say "Breach" alone or in a comma list.
    const idx = t.search(/\bbreach\b/);
    const before = t.substring(0, idx);
    const isConditional = before.includes(': ') &&
      (before.includes('if ') || before.includes('when '));
    if (!isConditional) kw.breach = true;
  }

  // ── Wall ──
  if (/\bwall\b/.test(t)) kw.wall = true;

  // ── Siphon ──
  if (/\bsiphon\b/.test(t)) kw.siphon = true;

  // ── Breaker (NEW in v2 rules) ──
  if (/\bbreaker\b/.test(t)) kw.breaker = true;

  // ── Fortify (NEW in v2 rules) ──
  if (/\bfortify\b/.test(t)) kw.fortify = true;

  // ── Bleed N — standing keyword, but not when granted to a target via ability ──
  // Match `bleed N` NOT preceded by "self" (Selfbleed is separate).
  const bm = t.match(/(?:^|[^a-z])bleed (\d+)/);
  if (bm) {
    const bIdx = t.indexOf(bm[0]);
    const bBefore = t.substring(0, bIdx);
    const inAbility = bBefore.includes('{exhaust}') || bBefore.includes('{overexhaust}') ||
                      bBefore.includes(': ') || bBefore.includes('gains ') ||
                      bBefore.includes('gain ') || bBefore.includes('target') ||
                      /bleed \+\d/.test(t.substring(bIdx - 2, bIdx + bm[0].length));
    if (!inAbility) kw.bleed = parseInt(bm[1]);
  }

  // ── Selfbleed N — standing keyword, only when not inside an ability cost/effect ──
  const sb = t.match(/selfbleed (\d+)/i);
  if (sb) {
    const sbIdx = t.indexOf(sb[0]);
    const sbBefore = t.substring(0, sbIdx);
    const inAbility = sbBefore.includes('{exhaust}') || sbBefore.includes('{overexhaust}') ||
                      sbBefore.includes(': ') || sbBefore.includes('when attacking') ||
                      sbBefore.includes('when this') || sbBefore.includes('whenever') ||
                      sbBefore.includes('may ') || sbBefore.includes('pay ') ||
                      sbBefore.includes('to ') || sbBefore.includes(' and ');
    if (!inAbility) kw.selfBleed = parseInt(sb[1]);
  }

  return kw;
}

// Check if an instance has a keyword (combines standing + temporary).
export function hasKeyword(inst, kw) {
  if (!inst) return false;
  if (inst.keywords && inst.keywords[kw]) return true;
  if (inst.tempKeywords && inst.tempKeywords[kw]) return true;
  return false;
}

// Get a numeric keyword value (Bleed N, Selfbleed N).
export function keywordValue(inst, kw) {
  if (!inst) return 0;
  const standing = inst.keywords?.[kw] || 0;
  const temp = inst.tempKeywords?.[kw] || 0;
  return (typeof standing === 'number' ? standing : 0)
       + (typeof temp === 'number' ? temp : 0);
}

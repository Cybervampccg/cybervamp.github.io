// ─────────────────────────────────────────────────────────────
// Card rendering — produce DOM elements from inst data
//
// Contexts:
//   - 'hand' — small fan card with cost badge, art, name
//   - 'battlefield' — board slot with power
// ─────────────────────────────────────────────────────────────

import { getEffectivePower } from './state.js';

export function createCardElement(inst, context = 'hand') {
  const el = document.createElement('div');
  el.className = `card card-${context} card-${(inst.faction || 'colorless').toLowerCase()}`;
  el.dataset.instId = inst.instId;
  el.dataset.cardId = inst.cardId;

  if (context === 'hand') {
    renderHandCard(el, inst);
  } else if (context === 'battlefield') {
    renderBattlefieldCard(el, inst);
  }

  return el;
}

function renderHandCard(el, inst) {
  const art = inst.image
    ? `<img class="card-art" src="${inst.image}" alt="" loading="lazy" onerror="this.style.display='none'" />`
    : `<div class="card-art card-art-placeholder">${factionGlyph(inst.faction)}</div>`;

  el.innerHTML = `
    ${art}
    <div class="card-cost-row">${renderCostBadges(inst)}</div>
    <div class="card-name-band" title="${escapeAttr(inst.name)}">${truncate(inst.name, 18)}</div>
    ${inst.type === 'Creature' && inst.basePower != null ?
      `<div class="card-power-band">${getEffectivePower(inst)}</div>` : ''}
  `;
}

function renderBattlefieldCard(el, inst) {
  const art = inst.image
    ? `<img class="card-art" src="${inst.image}" alt="" loading="lazy" onerror="this.style.display='none'" />`
    : `<div class="card-art card-art-placeholder">${factionGlyph(inst.faction)}</div>`;

  const effPower = getEffectivePower(inst);
  const displayPower = Math.max(0, effPower - (inst.damageTaken || 0));
  const damaged = (inst.damageTaken || 0) > 0;

  el.innerHTML = `
    ${art}
    ${inst.type === 'Creature' ?
      `<div class="card-power-bf ${damaged ? 'damaged' : ''}">${displayPower}</div>` : ''}
  `;

  if (inst.exhaustState === 'exhausted') el.classList.add('is-exhausted');
  if (inst.exhaustState === 'overexhausted') el.classList.add('is-overexhausted');
  if (inst.newlyTurned) el.classList.add('is-newly-turned');
}

function renderCostBadges(inst) {
  const parts = [];
  if (inst.goldCost > 0) {
    parts.push(`<span class="cost-badge cost-gold" title="Gold cost">${inst.goldCost}</span>`);
  }
  if (inst.bloodCost > 0) {
    parts.push(`<span class="cost-badge cost-blood" title="Blood cost (HP)">${inst.bloodCost}</span>`);
  }
  if (parts.length === 0) {
    parts.push(`<span class="cost-badge cost-zero" title="Free">0</span>`);
  }
  return parts.join('');
}

function factionGlyph(faction) {
  const map = {
    Red: '🔴', White: '⚪', Black: '🟣', Purple: '🟪', Colorless: '◇',
  };
  return map[faction] || '◇';
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.substring(0, n - 1) + '…' : str;
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

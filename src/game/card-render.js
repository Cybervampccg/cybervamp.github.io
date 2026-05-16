// ─────────────────────────────────────────────────────────────
// Card rendering — produce DOM elements from inst data
//
// Contexts:
//   - 'hand' — card in hand fan, full-size with prominent cost coin
//   - 'battlefield' — card in slot, fills the slot frame
//   - 'preview' — full-screen preview (fired by long-press)
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
  } else if (context === 'preview') {
    renderPreviewCard(el, inst);
  }

  return el;
}

function renderHandCard(el, inst) {
  const art = inst.image
    ? `<img class="card-art" src="${inst.image}" alt="" loading="lazy" onerror="this.style.display='none'" />`
    : `<div class="card-art card-art-placeholder">${factionGlyph(inst.faction)}</div>`;

  el.innerHTML = `
    ${art}
    <div class="card-cost-stack">${renderCostCoins(inst, 'large')}</div>
    <div class="card-name-strip" title="${escapeAttr(inst.name)}">${truncate(inst.name, 18)}</div>
    ${inst.type === 'Creature' && inst.basePower != null ?
      `<div class="card-power-coin">${getEffectivePower(inst)}</div>` : ''}
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
      `<div class="card-power-coin bf ${damaged ? 'damaged' : ''}">${displayPower}</div>` : ''}
  `;

  if (inst.faction) el.dataset.faction = inst.faction;
  if (inst.rarity) el.dataset.rarity = inst.rarity;

  if (inst.exhaustState === 'exhausted') el.classList.add('is-exhausted');
  if (inst.exhaustState === 'overexhausted') el.classList.add('is-overexhausted');
  if (inst.newlyTurned) el.classList.add('is-newly-turned');
}

function renderPreviewCard(el, inst) {
  const art = inst.image
    ? `<img class="card-art" src="${inst.image}" alt="" loading="lazy" />`
    : `<div class="card-art card-art-placeholder">${factionGlyph(inst.faction)}</div>`;

  el.innerHTML = `
    ${art}
    <div class="preview-info">
      <div class="preview-name">${escapeHtml(inst.name)}</div>
      <div class="preview-meta">
        ${inst.type}${inst.subtype ? ` · ${inst.subtype}` : ''}
        ${inst.faction ? ` · ${inst.faction}` : ''}
      </div>
      <div class="preview-cost">${renderCostCoins(inst, 'preview')}</div>
      ${inst.type === 'Creature' && inst.basePower != null ?
        `<div class="preview-stat-row"><span class="stat-label">Power</span> <span class="stat-val">${getEffectivePower(inst)}</span></div>` : ''}
      ${inst.abilities ? `<div class="preview-abilities">${escapeHtml(inst.abilities)}</div>` : ''}
      ${inst.flavor ? `<div class="preview-flavor">${escapeHtml(inst.flavor)}</div>` : ''}
    </div>
  `;
}

function renderCostCoins(inst, size = 'large') {
  const parts = [];
  if (inst.goldCost > 0) {
    parts.push(`<span class="cost-coin gold ${size}" title="Gold">${inst.goldCost}</span>`);
  }
  if (inst.bloodCost > 0) {
    parts.push(`<span class="cost-coin blood ${size}" title="Blood (HP)">${inst.bloodCost}</span>`);
  }
  if (parts.length === 0) {
    parts.push(`<span class="cost-coin zero ${size}" title="Free">0</span>`);
  }
  return parts.join('');
}

function factionGlyph(faction) {
  return ({ Red:'🔴', White:'⚪', Black:'🟣', Purple:'🟪', Colorless:'◇' })[faction] || '◇';
}

function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.substring(0, n - 1) + '…' : str;
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

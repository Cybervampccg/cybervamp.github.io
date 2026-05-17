// ─────────────────────────────────────────────────────────────
// Deck Builder Screen
//
// Full-screen UI for browsing cards by faction/type and building
// a custom deck (20–40 cards, max 3 copies / 1 of Unique).
// Deck is persisted to localStorage.
//
// API:
//   mountDeckBuilder(container, { onBack, onStartBattle })
//     onBack() — navigate back to home
//     onStartBattle({ faction, deck }) — deck is an array of card instances
//
//   getSavedDeckInfo() → { faction, count } | null
//   buildDeckFromSaved(owner) → array of instances | null
// ─────────────────────────────────────────────────────────────

import { CARDS_BY_ID, CARDS_BY_FACTION } from '../game/cards.js';
import { makeInst } from '../game/state.js';
import { createCardElement } from '../game/card-render.js';

const FACTIONS = ['Red', 'Black', 'White', 'Purple'];

const FACTION_STYLE = {
  Red:    { border: '#dc2626', bg: 'rgba(220,38,38,0.18)',    text: '#f87171', icon: '🔴' },
  Black:  { border: '#94a3b8', bg: 'rgba(71,85,105,0.25)',   text: '#cbd5e1', icon: '⚫' },
  White:  { border: '#e2e8f0', bg: 'rgba(226,232,240,0.12)', text: '#f8fafc', icon: '⚪' },
  Purple: { border: '#7c3aed', bg: 'rgba(124,58,237,0.22)',   text: '#c4b5fd', icon: '🟣' },
};

const DECK_MIN = 20;   // minimum to start a battle
const DECK_MAX = 40;   // hard cap
const MAX_COPIES = 3;  // per non-Unique card
const STORAGE_KEY = 'cvamp_deck_v1';

// ── Persistence helpers ───────────────────────────────────────

export function loadSavedDeck() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function _save(faction, cards) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ faction, cards })); } catch {}
}

/** Returns { faction, count } if a playable deck exists, else null. */
export function getSavedDeckInfo() {
  const d = loadSavedDeck();
  if (!d || !Array.isArray(d.cards) || d.cards.length < DECK_MIN) return null;
  return { faction: d.faction, count: d.cards.length };
}

/** Build instances from a saved deck for battle use. */
export function buildDeckFromSaved(owner) {
  const d = loadSavedDeck();
  if (!d?.cards?.length) return null;
  return d.cards.map(id => makeInst(id, owner)).filter(Boolean);
}

// ── Mount ─────────────────────────────────────────────────────

export function mountDeckBuilder(container, { onBack, onStartBattle }) {
  const saved     = loadSavedDeck();
  let faction     = saved?.faction || 'Red';
  let filterType  = 'all';      // 'all' | 'Creature' | 'Spell' | 'Relic'
  let deckCards   = saved?.cards ? [...saved.cards] : [];
  let activeCard  = null;       // card object currently shown in detail panel

  // ── Data helpers ──────────────────────────────────────────

  function counts() {
    const m = {};
    for (const id of deckCards) m[id] = (m[id] || 0) + 1;
    return m;
  }

  function visibleCards() {
    const main      = CARDS_BY_FACTION[faction] || [];
    const colorless = CARDS_BY_FACTION['Colorless'] || [];
    const pool      = [...main, ...colorless];
    return pool.filter(c => {
      if (c.subtype === 'Token') return false;
      if (filterType !== 'all' && c.type !== filterType) return false;
      return true;
    });
  }

  function addCard(cardId) {
    if (deckCards.length >= DECK_MAX) { flash('Deck is full (40 cards max)'); return; }
    const card = CARDS_BY_ID[cardId];
    if (!card) return;
    const max = card.subtype === 'Unique' ? 1 : MAX_COPIES;
    if ((counts()[cardId] || 0) >= max) { flash(`Max ${max} cop${max === 1 ? 'y' : 'ies'} allowed`); return; }
    deckCards.push(cardId);
    _save(faction, deckCards);
    refresh();
  }

  function removeCard(cardId) {
    const idx = deckCards.lastIndexOf(cardId);
    if (idx >= 0) {
      deckCards.splice(idx, 1);
      _save(faction, deckCards);
      refresh();
    }
  }

  function flash(msg) {
    const el = container.querySelector('#db-flash');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('visible');
    clearTimeout(flash._t);
    flash._t = setTimeout(() => el?.classList.remove('visible'), 1800);
  }

  // ── Full render (called once) ─────────────────────────────

  function render() {
    container.innerHTML = `
      <div id="deck-builder">
        <div class="db-header" id="db-header"></div>

        <div class="db-faction-strip">
          ${FACTIONS.map(f => {
            const s = FACTION_STYLE[f];
            return `<button class="db-faction-btn${faction === f ? ' active' : ''}" data-faction="${f}"
              style="--fbc:${s.border};--fbg:${s.bg};--fbt:${s.text};">
              ${s.icon} ${f}
            </button>`;
          }).join('')}
        </div>

        <div class="db-type-strip">
          ${[['all','All'],['Creature','⚔ Creatures'],['Spell','✨ Spells'],['Relic','💎 Relics']].map(([v, l]) =>
            `<button class="db-type-btn${filterType === v ? ' active' : ''}" data-type="${v}">${l}</button>`
          ).join('')}
        </div>

        <div class="db-scroll">
          <div class="db-card-grid" id="db-grid"></div>
        </div>

        <div class="db-footer" id="db-footer"></div>

        <div id="db-flash" class="db-flash"></div>

        <!-- Card detail bottom sheet -->
        <div id="db-detail" class="db-detail hidden">
          <div class="db-detail-backdrop"></div>
          <div class="db-detail-sheet" id="db-detail-sheet"></div>
        </div>

        <!-- Deck list overlay -->
        <div id="db-list-overlay" class="db-list-overlay hidden">
          <div class="db-list-modal" id="db-list-modal"></div>
        </div>
      </div>
    `;

    // Faction tabs
    container.querySelectorAll('.db-faction-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.dataset.faction;
        if (f === faction) return;
        if (deckCards.length > 0 && !confirm('Switching faction will clear your deck. Continue?')) return;
        faction = f;
        deckCards = [];
        _save(faction, deckCards);
        container.querySelectorAll('.db-faction-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.faction === faction));
        refresh();
      });
    });

    // Type filter
    container.querySelectorAll('.db-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        filterType = btn.dataset.type;
        container.querySelectorAll('.db-type-btn').forEach(b =>
          b.classList.toggle('active', b.dataset.type === filterType));
        renderGrid();
      });
    });

    // Detail backdrop dismisses panel
    container.querySelector('.db-detail-backdrop')?.addEventListener('click', closeDetail);

    renderHeader();
    renderGrid();
    renderFooter();
  }

  // ── Partial refreshes ──────────────────────────────────────

  function refresh() {
    renderHeader();
    renderGrid();
    renderFooter();
    if (activeCard) renderDetailSheet(activeCard);
  }

  function renderHeader() {
    const el = container.querySelector('#db-header');
    if (!el) return;
    const n = deckCards.length;
    const pct = Math.round((n / DECK_MAX) * 100);
    const full = n >= DECK_MAX;
    el.innerHTML = `
      <button class="db-back-btn" id="db-back">← BACK</button>
      <div class="db-header-mid">
        <span class="db-header-title">DECK BUILDER</span>
        <div class="db-progress-bar">
          <div class="db-progress-fill${full ? ' full' : ''}" style="width:${pct}%"></div>
        </div>
      </div>
      <div class="db-header-count${full ? ' full' : ''}">${n}<span class="db-count-denom">/${DECK_MAX}</span></div>
    `;
    el.querySelector('#db-back').addEventListener('click', onBack);
  }

  function renderGrid() {
    const grid = container.querySelector('#db-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const c = counts();
    visibleCards().forEach(card => {
      const count  = c[card.id] || 0;
      const maxCop = card.subtype === 'Unique' ? 1 : MAX_COPIES;
      const atMax  = count >= maxCop;

      const item = document.createElement('div');
      item.className = `db-card-item${atMax ? ' at-max' : ''}`;

      const inst  = makeInst(card.id, 'player');
      const cardEl = createCardElement(inst, 'hand');
      cardEl.style.width  = '100%';
      cardEl.style.height = '100%';
      item.appendChild(cardEl);

      if (count > 0) {
        const badge = document.createElement('div');
        badge.className = 'db-count-badge';
        badge.textContent = `×${count}`;
        item.appendChild(badge);
      }

      item.addEventListener('click', () => openDetail(card));
      grid.appendChild(item);
    });
  }

  function renderFooter() {
    const el = container.querySelector('#db-footer');
    if (!el) return;
    const c = counts();
    const ids = deckCards;
    const creatures = ids.filter(id => CARDS_BY_ID[id]?.type === 'Creature').length;
    const spells    = ids.filter(id => CARDS_BY_ID[id]?.type === 'Spell').length;
    const relics    = ids.filter(id => CARDS_BY_ID[id]?.type === 'Relic').length;
    const ready     = ids.length >= DECK_MIN;

    el.innerHTML = `
      <div class="db-footer-stats">
        <span class="db-fstat"><span class="db-fstat-icon">⚔</span>${creatures}</span>
        <span class="db-fstat"><span class="db-fstat-icon">✨</span>${spells}</span>
        <span class="db-fstat"><span class="db-fstat-icon">💎</span>${relics}</span>
        ${!ready ? `<span class="db-fstat-hint">+${DECK_MIN - ids.length} needed</span>` : ''}
      </div>
      <div class="db-footer-btns">
        <button class="db-footer-btn db-btn-clear" id="db-clear" title="Clear deck">🗑</button>
        <button class="db-footer-btn db-btn-list" id="db-list">📋 LIST</button>
        <button class="db-footer-btn db-btn-battle${ready ? '' : ' dim'}" id="db-battle">⚔ BATTLE</button>
      </div>
    `;

    el.querySelector('#db-clear').addEventListener('click', () => {
      if (!deckCards.length) return;
      if (confirm('Clear all cards from your deck?')) {
        deckCards = [];
        _save(faction, deckCards);
        refresh();
      }
    });

    el.querySelector('#db-list').addEventListener('click', renderDeckList);

    el.querySelector('#db-battle').addEventListener('click', () => {
      if (!ready) { flash(`Add ${DECK_MIN - deckCards.length} more cards to battle`); return; }
      const deck = deckCards.map(id => makeInst(id, 'player')).filter(Boolean);
      onStartBattle({ faction, deck });
    });
  }

  // ── Card detail sheet ──────────────────────────────────────

  function openDetail(card) {
    activeCard = card;
    renderDetailSheet(card);
    container.querySelector('#db-detail').classList.remove('hidden');
  }

  function closeDetail() {
    activeCard = null;
    container.querySelector('#db-detail').classList.add('hidden');
  }

  function renderDetailSheet(card) {
    const sheet = container.querySelector('#db-detail-sheet');
    if (!sheet) return;
    const inst   = makeInst(card.id, 'player');
    const c      = counts();
    const count  = c[card.id] || 0;
    const maxCop = card.subtype === 'Unique' ? 1 : MAX_COPIES;
    const canAdd = count < maxCop && deckCards.length < DECK_MAX;
    const canRem = count > 0;

    sheet.innerHTML = '';

    // Close X
    const closeBtn = document.createElement('button');
    closeBtn.className = 'db-detail-close';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', closeDetail);
    sheet.appendChild(closeBtn);

    // Card art column
    const artCol = document.createElement('div');
    artCol.className = 'db-detail-art';
    const cardEl = createCardElement(inst, 'preview');
    artCol.appendChild(cardEl);
    sheet.appendChild(artCol);

    // Info column
    const infoCol = document.createElement('div');
    infoCol.className = 'db-detail-info';

    const costStr = [
      card.goldCost > 0 ? `${card.goldCost}⛁` : '',
      card.bloodCost > 0 ? `${card.bloodCost}🩸` : '',
    ].filter(Boolean).join('  ') || 'Free';

    infoCol.innerHTML = `
      <div class="db-detail-name">${card.name}</div>
      <div class="db-detail-meta">${card.faction} · ${card.type}${card.subtype ? ' · ' + card.subtype : ''}</div>
      <div class="db-detail-cost">${costStr}${card.type === 'Creature' ? `<span class="db-detail-power">· ⚔ ${card.power ?? '?'}</span>` : ''}</div>
      <div class="db-detail-abilities">${card.abilities || '—'}</div>
      ${card.flavor ? `<div class="db-detail-flavor">"${card.flavor}"</div>` : ''}
    `;

    // Add / Remove row
    const controls = document.createElement('div');
    controls.className = 'db-detail-controls';
    controls.innerHTML = `
      <button class="db-ctrl-btn db-ctrl-remove${canRem ? '' : ' dim'}" id="dd-rem">− Remove</button>
      <div class="db-ctrl-count">${count}<span style="opacity:.5">/${maxCop}</span></div>
      <button class="db-ctrl-btn db-ctrl-add${canAdd ? '' : ' dim'}" id="dd-add">+ Add</button>
    `;
    infoCol.appendChild(controls);
    sheet.appendChild(infoCol);

    sheet.querySelector('#dd-add').addEventListener('click', () => addCard(card.id));
    sheet.querySelector('#dd-rem').addEventListener('click', () => removeCard(card.id));
  }

  // ── Deck list overlay ──────────────────────────────────────

  function renderDeckList() {
    const overlay = container.querySelector('#db-list-overlay');
    const modal   = container.querySelector('#db-list-modal');
    if (!overlay || !modal) return;

    const grouped = {};
    for (const id of deckCards) {
      const card = CARDS_BY_ID[id];
      if (!card) continue;
      if (!grouped[id]) grouped[id] = { card, count: 0 };
      grouped[id].count++;
    }

    const typeOrder = { Creature: 0, Relic: 1, Spell: 2 };
    const rows = Object.values(grouped).sort((a, b) => {
      const td = (typeOrder[a.card.type] ?? 9) - (typeOrder[b.card.type] ?? 9);
      if (td !== 0) return td;
      return (a.card.goldCost + a.card.bloodCost) - (b.card.goldCost + b.card.bloodCost);
    });

    modal.innerHTML = `
      <div class="db-list-header">
        <span class="db-list-title">YOUR DECK</span>
        <span class="db-list-count-label">${deckCards.length}/${DECK_MAX}</span>
        <button class="db-list-close" id="db-list-close">✕</button>
      </div>
      <div class="db-list-rows">
        ${rows.length === 0
          ? '<div class="db-list-empty">No cards added yet.</div>'
          : rows.map(({ card, count }) => `
            <div class="db-list-row" data-id="${card.id}">
              <span class="db-list-row-count">×${count}</span>
              <span class="db-list-row-type db-type-${card.type.toLowerCase()}">${card.type[0]}</span>
              <span class="db-list-row-name">${card.name}</span>
              <span class="db-list-row-cost">${[card.goldCost > 0 ? card.goldCost + '⛁' : '', card.bloodCost > 0 ? card.bloodCost + '🩸' : ''].filter(Boolean).join(' ')}</span>
              <button class="db-list-row-rem" data-id="${card.id}">−</button>
            </div>
          `).join('')}
      </div>
    `;

    modal.querySelector('#db-list-close').addEventListener('click', () => overlay.classList.add('hidden'));

    modal.querySelectorAll('.db-list-row-rem').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        removeCard(btn.dataset.id);
        // Update the row in-place
        const row = modal.querySelector(`.db-list-row[data-id="${btn.dataset.id}"]`);
        if (row) {
          const newCount = (counts()[btn.dataset.id] || 0);
          if (newCount === 0) row.remove();
          else row.querySelector('.db-list-row-count').textContent = `×${newCount}`;
        }
        modal.querySelector('.db-list-count-label').textContent = `${deckCards.length}/${DECK_MAX}`;
      });
    });

    overlay.classList.remove('hidden');
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.add('hidden'); }, { once: true });
  }

  render();
}

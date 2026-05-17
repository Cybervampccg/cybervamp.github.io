// ─────────────────────────────────────────────────────────────
// Home Screen — Cybervamp v2
// ─────────────────────────────────────────────────────────────

import { CARDS } from '../game/cards.js';
import { loadMeta, resetMeta } from '../meta/meta-state.js';
import { makeInitialState, getEffectivePower } from '../game/state.js';
import { buildDefaultDeck } from '../game/decks.js';
import { mountBattleScreen } from './battle-screen.js';
import { mountDeckBuilder, getSavedDeckInfo, buildDeckFromSaved } from './deck-builder.js';

const ALL_FACTIONS = ['Red', 'Black', 'White', 'Purple'];

function randomFaction(exclude = null) {
  const opts = ALL_FACTIONS.filter(f => f !== exclude);
  return opts[Math.floor(Math.random() * opts.length)];
}

export function mountHomeScreen(container) {
  const meta      = loadMeta();
  const savedDeck = getSavedDeckInfo(); // { faction, count } | null

  container.innerHTML = `
    <div id="home-screen">
      <div class="home-logo">CYBERVAMP</div>
      <div class="home-sub">v2.0 · Card Battle</div>

      <div class="home-info">
        <div>📇 ${CARDS.length} cards loaded</div>
        ${savedDeck
          ? `<div class="home-saved-deck">💾 Saved deck: <strong>${savedDeck.faction}</strong> — ${savedDeck.count} cards</div>`
          : `<div style="color:#7a6a98; font-style:italic">No saved deck — build one below</div>`}
      </div>

      <div class="home-actions">
        <button class="home-btn home-btn-deckbuild" data-action="deck-builder">
          🃏 BUILD DECK
        </button>

        ${savedDeck
          ? `<button class="home-btn home-btn-primary" data-action="play-saved">
               ⚔ PLAY SAVED DECK
               <span class="home-btn-sub">${savedDeck.faction} vs random AI</span>
             </button>`
          : ''}

        <div class="home-divider">Quick Battle</div>

        <button class="home-btn home-btn-secondary" data-action="battle-red-black">
          ⚔ Red vs Black
        </button>
        <button class="home-btn home-btn-secondary" data-action="battle-purple-white">
          ⚔ Purple vs White
        </button>

        <div class="home-divider">Dev</div>

        <button class="home-btn home-btn-secondary" data-action="template-mode" style="font-size:12px;">
          📐 Template Mode
        </button>
        <button class="home-btn home-btn-warn" data-action="reset-meta">
          ⚠ Reset Save Data
        </button>
      </div>

      <div id="home-status" class="home-status"></div>
    </div>
  `;

  container.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action, container));
  });
}

function handleAction(action, container) {
  const status = container.querySelector('#home-status');

  switch (action) {

    case 'deck-builder':
      mountDeckBuilder(container, {
        onBack: () => mountHomeScreen(container),
        onStartBattle: ({ faction, deck }) => {
          const aiFaction = randomFaction(faction);
          startBattle(faction, aiFaction, container, false, deck);
        },
      });
      break;

    case 'play-saved': {
      const info = getSavedDeckInfo();
      if (!info) { showStatus(status, '⚠ No valid saved deck. Build one first.', 'warn'); return; }
      const playerDeck = buildDeckFromSaved('player');
      if (!playerDeck) { showStatus(status, '⚠ Deck load failed.', 'warn'); return; }
      const aiFaction = randomFaction(info.faction);
      startBattle(info.faction, aiFaction, container, false, playerDeck);
      break;
    }

    case 'battle-red-black':
      startBattle('Red', 'Black', container, false);
      break;

    case 'battle-purple-white':
      startBattle('Purple', 'White', container, false);
      break;

    case 'template-mode':
      startBattle('Red', 'Black', container, true);
      break;

    case 'reset-meta': {
      if (!confirm('Wipe all save data? This cannot be undone.')) return;
      resetMeta();
      showStatus(status, '✓ Meta wiped. Reload page to see fresh state.', 'warn');
      break;
    }
  }
}

function startBattle(playerFaction, aiFaction, container, templateMode, customPlayerDeck = null) {
  const playerDeck = customPlayerDeck || buildDefaultDeck(playerFaction, 'player');
  const aiDeck     = buildDefaultDeck(aiFaction, 'ai');
  const G_new      = makeInitialState({ playerFaction, aiFaction, playerDeck, aiDeck });
  window.G               = G_new;
  window.getEffectivePower = getEffectivePower;
  window._battleLog      = [`— Battle: ${playerFaction} vs ${aiFaction} —`];
  console.log(`▶ Battle: ${playerFaction} vs ${aiFaction}${templateMode ? ' (TEMPLATE)' : ''}`);
  mountBattleScreen(container, { templateMode });
}

function showStatus(el, msg, cls = 'success') {
  if (!el) return;
  el.textContent = msg;
  el.className = `home-status ${cls}`;
}

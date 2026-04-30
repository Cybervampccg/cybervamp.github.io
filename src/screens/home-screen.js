// ─────────────────────────────────────────────────────────────
// Home Screen — Test/Dev Hub with Template Mode toggle
// ─────────────────────────────────────────────────────────────

import { CARDS } from '../game/cards.js';
import { loadMeta, resetMeta } from '../meta/meta-state.js';
import { makeInitialState, getEffectivePower } from '../game/state.js';
import { buildDefaultDeck } from '../game/decks.js';
import { mountBattleScreen } from './battle-screen.js';

export function mountHomeScreen(container) {
  const meta = loadMeta();

  container.innerHTML = `
    <div id="home-screen">
      <div class="home-logo">CYBERVAMP</div>
      <div class="home-sub">v2.0 · Session C-Final · UI Anchors</div>

      <div class="home-info">
        <div>📇 ${CARDS.length} cards loaded</div>
        <div>💾 Meta state: v${meta.version}</div>
        <div>💰 Ore: ${meta.resources.ore}</div>
        <div>💳 Credits: ${meta.resources.credits}</div>
      </div>

      <div class="home-instructions">
        <strong>Template Mode</strong> shows colored boxes where each UI region sits — no background image needed. Use this to confirm anchors before generating new bg art.
      </div>

      <div class="home-actions">
        <button class="home-btn home-btn-primary" data-action="battle-red-black">
          ⚔ Battle: Red vs Black
        </button>
        <button class="home-btn home-btn-primary" data-action="battle-purple-white">
          ⚔ Battle: Purple vs White
        </button>
        <button class="home-btn home-btn-secondary" data-action="template-mode">
          📐 Template Mode (anchor preview)
        </button>
        <button class="home-btn home-btn-secondary" data-action="inspect-state">
          🔍 Inspect current G state
        </button>
        <button class="home-btn home-btn-warn" data-action="reset-meta">
          ⚠ Reset meta (clear save)
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
    case 'battle-red-black':
      startBattle('Red', 'Black', container, false);
      break;
    case 'battle-purple-white':
      startBattle('Purple', 'White', container, false);
      break;
    case 'template-mode':
      // Init a Red vs Black battle but render in template mode
      startBattle('Red', 'Black', container, true);
      break;
    case 'inspect-state': {
      const G = window.G;
      if (!G) {
        status.textContent = '⚠ No active state. Start a battle first.';
        status.className = 'home-status warn';
        return;
      }
      console.log('Current G:', G);
      status.textContent = '✓ State printed to console (F12).';
      status.className = 'home-status success';
      break;
    }
    case 'reset-meta': {
      if (!confirm('Wipe all save data? This cannot be undone.')) return;
      resetMeta();
      status.textContent = '✓ Meta wiped. Reload page to see fresh state.';
      status.className = 'home-status warn';
      break;
    }
  }
}

function startBattle(playerFaction, aiFaction, container, templateMode) {
  const playerDeck = buildDefaultDeck(playerFaction, 'player');
  const aiDeck = buildDefaultDeck(aiFaction, 'ai');
  const G_new = makeInitialState({ playerFaction, aiFaction, playerDeck, aiDeck });
  window.G = G_new;
  window.getEffectivePower = getEffectivePower;
  window._battleLog = [`— Battle begins: ${playerFaction} vs ${aiFaction} —`];
  console.log(`▶ Battle: ${playerFaction} vs ${aiFaction}${templateMode ? ' (TEMPLATE MODE)' : ''}`);
  mountBattleScreen(container, { templateMode });
}

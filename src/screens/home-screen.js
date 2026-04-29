// ─────────────────────────────────────────────────────────────
// Home Screen — Test/Dev Hub
//
// Renders the test home screen with state-init buttons + a
// new "Open battle shell" button that mounts the static UI.
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
      <div class="home-sub">v2.0 · Session B · UI Shell</div>

      <div class="home-info">
        <div>📇 ${CARDS.length} cards loaded</div>
        <div>💾 Meta state: v${meta.version}</div>
        <div>🩸 Player: ${meta.player?.nexusName || 'The Nexus'}</div>
        <div>💰 Ore: ${meta.resources.ore}</div>
        <div>💳 Credits: ${meta.resources.credits}</div>
      </div>

      <div class="home-instructions">
        Click "Open battle shell" to see the static UI layout. State-init
        buttons remain for console verification (F12 → Console).
      </div>

      <div class="home-actions">
        <button class="home-btn home-btn-primary" data-action="open-battle">
          ⚔ Open Battle Shell (UI preview)
        </button>
        <button class="home-btn" data-action="test-red-vs-black">
          🧪 Init State: Red vs Black
        </button>
        <button class="home-btn" data-action="test-purple-vs-white">
          🧪 Init State: Purple vs White
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
    case 'open-battle': {
      mountBattleScreen(container);
      break;
    }

    case 'test-red-vs-black': {
      const playerDeck = buildDefaultDeck('Red', 'player');
      const aiDeck     = buildDefaultDeck('Black', 'ai');
      const G_new = makeInitialState({
        playerFaction: 'Red',
        aiFaction: 'Black',
        playerDeck,
        aiDeck,
      });
      console.log('▶ Test battle initialized: Red vs Black');
      console.log('Full G state:', G_new);
      console.log('Player hand:', G_new.player.hand.map(c => `${c.name} [${c.goldCost}G/${c.bloodCost}B]`));
      console.log('AI hand:', G_new.ai.hand.map(c => `${c.name} [${c.goldCost}G/${c.bloodCost}B]`));
      window.G = G_new;
      window.getEffectivePower = getEffectivePower;
      status.textContent = '✓ Red vs Black state initialized. See console (F12).';
      status.className = 'home-status success';
      break;
    }

    case 'test-purple-vs-white': {
      const playerDeck = buildDefaultDeck('Purple', 'player');
      const aiDeck     = buildDefaultDeck('White', 'ai');
      const G_new = makeInitialState({
        playerFaction: 'Purple',
        aiFaction: 'White',
        playerDeck,
        aiDeck,
      });
      console.log('▶ Test battle initialized: Purple vs White');
      console.log('Full G state:', G_new);
      window.G = G_new;
      window.getEffectivePower = getEffectivePower;
      status.textContent = '✓ Purple vs White state initialized. See console.';
      status.className = 'home-status success';
      break;
    }

    case 'inspect-state': {
      const G = window.G;
      if (!G) {
        status.textContent = '⚠ No active state. Click an Init State button first.';
        status.className = 'home-status warn';
        return;
      }
      console.log('Current G:', G);
      status.textContent = '✓ State printed to console.';
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

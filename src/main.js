// ─────────────────────────────────────────────────────────────
// Cybervamp v2 — Boot + Test Home Screen
//
// Session A milestone: prove that state foundation wires up.
// No battle UI yet. Buttons trigger state initialization
// and dump the result to the browser console for verification.
//
// Open DevTools (F12) → Console tab to see output.
// ─────────────────────────────────────────────────────────────

import './styles/main.css';
import { CARDS } from './game/cards.js';
import { loadMeta, resetMeta } from './meta/meta-state.js';
import { makeInitialState, G, getEffectivePower } from './game/state.js';
import { buildDefaultDeck } from './game/decks.js';

console.log(`Cybervamp v2 booting…`);
console.log(`Loaded ${CARDS.length} cards.`);

const meta = loadMeta();
console.log('Meta state:', meta);

function renderHomeScreen() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div id="home-screen">
      <div class="home-logo">CYBERVAMP</div>
      <div class="home-sub">v2.0 · Session A · State Foundation</div>

      <div class="home-info">
        <div>📇 ${CARDS.length} cards loaded</div>
        <div>💾 Meta state: v${meta.version}</div>
        <div>🩸 Player: ${meta.player?.nexusName || 'The Nexus'}</div>
        <div>💰 Ore: ${meta.resources.ore}</div>
        <div>💳 Credits: ${meta.resources.credits}</div>
      </div>

      <div class="home-instructions">
        Open DevTools (F12) → Console tab to see test output.
        Each button initializes a battle state and dumps it to the console.
      </div>

      <div class="home-actions">
        <button class="home-btn" data-action="test-red-vs-black">
          ⚔ Test: Red vs Black
        </button>
        <button class="home-btn" data-action="test-purple-vs-white">
          ⚔ Test: Purple vs White
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

  // Wire up buttons
  app.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleAction(btn.dataset.action));
  });
}

function handleAction(action) {
  const status = document.getElementById('home-status');

  switch (action) {
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
      console.log('Player deck size:', G_new.player.deck.length);
      console.log('AI hand:', G_new.ai.hand.map(c => `${c.name} [${c.goldCost}G/${c.bloodCost}B]`));
      console.log('AI deck size:', G_new.ai.deck.length);
      // Make G accessible from console for tinkering
      window.G = G_new;
      window.getEffectivePower = getEffectivePower;
      status.textContent = '✓ Red vs Black state initialized. See console (F12). Use window.G to inspect.';
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
      console.log('Player hand:', G_new.player.hand.map(c => `${c.name} [${c.goldCost}G/${c.bloodCost}B]`));
      console.log('AI hand:', G_new.ai.hand.map(c => `${c.name} [${c.goldCost}G/${c.bloodCost}B]`));
      window.G = G_new;
      window.getEffectivePower = getEffectivePower;
      status.textContent = '✓ Purple vs White state initialized. See console.';
      status.className = 'home-status success';
      break;
    }

    case 'inspect-state': {
      if (!G) {
        console.warn('No active G state. Click a Test button first.');
        status.textContent = '⚠ No active state. Click a Test button first.';
        status.className = 'home-status warn';
        return;
      }
      console.log('Current G:', G);
      console.log('Turn:', G.turn, '| Active:', G.activePlayer, '| Phase:', G.phase);
      console.log('Player blood:', G.player.blood, '| bleed pool:', G.player.bleedPool, '| gold:', G.player.gold);
      console.log('AI blood:', G.ai.blood, '| bleed pool:', G.ai.bleedPool, '| gold:', G.ai.gold);
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

// Boot — replace the static splash with the interactive home screen
setTimeout(renderHomeScreen, 300);

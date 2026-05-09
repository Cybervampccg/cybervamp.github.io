// ─────────────────────────────────────────────────────────────
// Home Screen — Cybervamp v2 · Session C-Final-Fix
// ─────────────────────────────────────────────────────────────
// VERSION CHECK: if you see "C-FINAL-FIX" in the home screen,
// this file IS deployed. If you don't see it, the file did NOT
// update on disk and you need to recopy.
// ─────────────────────────────────────────────────────────────

import { CARDS } from '../game/cards.js';
import { loadMeta, resetMeta } from '../meta/meta-state.js';
import { makeInitialState, getEffectivePower } from '../game/state.js';
import { buildDefaultDeck } from '../game/decks.js';
import { mountBattleScreen } from './battle-screen.js';

const VERSION_TAG = 'C-FINAL-FIX';

export function mountHomeScreen(container) {
  const meta = loadMeta();

  container.innerHTML = `
    <div id="home-screen">
      <div class="home-logo">CYBERVAMP</div>
      <div class="home-sub">v2.0 · ${VERSION_TAG} · Anchor Verification</div>

      <div class="home-info">
        <div>📇 ${CARDS.length} cards loaded</div>
        <div>💾 Meta state: v${meta.version}</div>
        <div>💰 Ore: ${meta.resources.ore}</div>
        <div>💳 Credits: ${meta.resources.credits}</div>
      </div>

      <div class="home-instructions">
        <strong style="color:#fde047">⬇ TEMPLATE MODE ⬇</strong><br>
        Click the green button to see colored regions where each UI
        element will sit — no background image. Use this to verify
        anchors are correct.
      </div>

      <div class="home-actions">
        <button class="home-btn" data-action="template-mode" style="background:linear-gradient(180deg, #16a34a 0%, #14532d 100%); border-color: #4ade80; color: #ecfdf5; font-size: 16px;">
          📐 OPEN TEMPLATE MODE
        </button>
        <button class="home-btn home-btn-primary" data-action="battle-red-black">
          ⚔ Battle: Red vs Black
        </button>
        <button class="home-btn home-btn-primary" data-action="battle-purple-white">
          ⚔ Battle: Purple vs White
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

  // Console version log so user can verify in DevTools
  console.log(`[Cybervamp] Home screen mounted — version ${VERSION_TAG}`);
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
      console.log('[Cybervamp] Template mode requested');
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

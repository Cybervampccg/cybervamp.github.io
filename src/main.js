// Cybervamp v2 — boot entry
//
// Module load order:
// 1. Styles (already linked in index.html)
// 2. State + persistence
// 3. Game data (cards)
// 4. UI shell
// 5. Boot routing — start at home/menu screen, not direct into a battle
//
// For now: just confirm everything wires up and show a "ready" state.

import './styles/main.css';
import { CARDS } from './game/cards.js';
import { loadMeta } from './meta/meta-state.js';

console.log(`Cybervamp v2 booting…`);
console.log(`Loaded ${CARDS.length} cards.`);

const meta = loadMeta();
console.log('Meta state:', meta);

// Hide boot screen, show "ready" placeholder
const boot = document.getElementById('boot-screen');
setTimeout(() => {
  boot.innerHTML = `
    <div class="boot-logo">CYBERVAMP</div>
    <div class="boot-sub">v2.0 · scaffold ready</div>
    <div class="boot-info">
      <div>📇 ${CARDS.length} cards loaded</div>
      <div>💾 Meta state: v${meta.version}</div>
      <div>🩸 HP: ${meta.player?.nexusName || 'The Nexus'}</div>
    </div>
    <div class="boot-hint">
      Build modules into <code>src/game/</code> and <code>src/screens/</code> to bring the game to life.
    </div>
  `;
}, 500);

// ─────────────────────────────────────────────────────────────
// Battle Screen — Static UI Shell (Session B)
//
// Renders the battlefield layout per design doc 08-ui-layout.md:
//   - Top bar (logo, phase pips, turn, mute)
//   - AI vitals + relics row
//   - AI battlefield (3+2 staggered creature slots, all empty for now)
//   - Center Combat Zone (animation band, empty for now)
//   - Player battlefield (3+2 staggered)
//   - Player vitals + relics row
//   - Hand fan (5 placeholder slots)
//   - Action bar
//   - Side dock (mission/log/settings toggles)
//
// No interactivity yet beyond the side dock toggle. No card data
// rendering. This is the SKELETON that game logic will populate.
// ─────────────────────────────────────────────────────────────

export function mountBattleScreen(container) {
  container.innerHTML = `
    <div id="battle-screen">
      ${renderTopBar()}
      ${renderVitalsRow('ai')}
      ${renderBattlefield('ai')}
      ${renderCenterCombatZone()}
      ${renderBattlefield('player')}
      ${renderVitalsRow('player')}
      ${renderHandFan()}
      ${renderActionBar()}
      ${renderSideDock()}
    </div>
  `;
  wireSideDock(container);
  wireBackToHome(container);
}

function renderTopBar() {
  return `
    <header id="topbar">
      <div class="logo">⚡ CV</div>
      <nav class="phase-track">
        <div class="phase-pip active" data-phase="renew">RNW</div>
        <div class="phase-pip" data-phase="main">MAIN</div>
        <div class="phase-pip" data-phase="combat">CMB</div>
        <div class="phase-pip" data-phase="end">END</div>
      </nav>
      <div class="turn-info">T:1</div>
      <button id="btn-mute" class="topbar-btn">🔊</button>
      <button id="btn-back-home" class="topbar-btn">⌂</button>
    </header>
  `;
}

function renderVitalsRow(side) {
  const isPlayer = side === 'player';
  const startBlood = 30;
  const startGold = isPlayer ? '0/0' : '-/-';
  return `
    <div class="vitals-row vitals-${side}">
      <div class="vital-cluster">
        <div class="vital-block ${isPlayer ? 'tappable' : ''}" data-vital="blood">
          <span class="vital-icon">❤</span>
          <span class="vital-num">${startBlood}</span>
        </div>
        <div class="vital-block" data-vital="bleed">
          <span class="vital-icon">🩸</span>
          <span class="vital-num">0</span>
        </div>
        <div class="vital-block ${isPlayer ? '' : 'dim'}" data-vital="gold">
          <span class="vital-icon">⛁</span>
          <span class="vital-num">${startGold}</span>
        </div>
      </div>
      <div class="relic-strip">
        ${[0,1,2,3].map(i => `<div class="relic-slot empty" data-relic-slot="${i}"></div>`).join('')}
      </div>
    </div>
  `;
}

function renderBattlefield(side) {
  return `
    <div class="battlefield battlefield-${side}">
      <!-- Front row: 3 slots -->
      <div class="creature-row creature-row-front">
        ${[0,1,2].map(i => renderCreatureSlot(side, i, 'front')).join('')}
      </div>
      <!-- Back row: 2 slots, offset to fall between front cards -->
      <div class="creature-row creature-row-back">
        ${[3,4].map(i => renderCreatureSlot(side, i, 'back')).join('')}
      </div>
    </div>
  `;
}

function renderCreatureSlot(side, idx, row) {
  return `
    <div class="creature-slot creature-slot-${row} empty" data-side="${side}" data-creature-slot="${idx}">
      <div class="token-orbit">
        <div class="token-slot empty" data-token-slot="0"></div>
        <div class="token-slot empty" data-token-slot="1"></div>
        <div class="token-slot empty" data-token-slot="2"></div>
      </div>
      <div class="creature-card empty"></div>
    </div>
  `;
}

function renderCenterCombatZone() {
  return `
    <div id="combat-zone" class="combat-zone">
      <div class="combat-zone-label">━━━ COMBAT ZONE ━━━</div>
    </div>
  `;
}

function renderHandFan() {
  // 5 placeholder slots in a fan curve
  return `
    <div id="hand-fan">
      ${[0,1,2,3,4].map(i => renderHandSlot(i, 5)).join('')}
    </div>
  `;
}

function renderHandSlot(idx, totalCount) {
  // Calculate fan rotation: spread cards across an arc
  const center = (totalCount - 1) / 2;
  const offset = idx - center;
  const angleStep = 6; // degrees between each card
  const rotation = offset * angleStep;
  const yLift = Math.abs(offset) * 4; // outer cards sit slightly lower
  return `
    <div class="hand-slot empty" data-hand-slot="${idx}"
         style="transform: rotate(${rotation}deg) translateY(${yLift}px);">
      <div class="hand-card empty"></div>
    </div>
  `;
}

function renderActionBar() {
  return `
    <div id="action-bar">
      <button class="action-btn primary" data-action="next">NEXT ▶</button>
    </div>
  `;
}

function renderSideDock() {
  return `
    <aside id="side-dock">
      <button class="dock-btn" data-dock="mission" title="Mission">📋</button>
      <button class="dock-btn" data-dock="log" title="Log">📜</button>
      <button class="dock-btn" data-dock="settings" title="Settings">⚙</button>
    </aside>
    <div id="dock-panel" class="hidden">
      <div class="dock-panel-header">
        <span id="dock-panel-title">Panel</span>
        <button class="dock-panel-close" data-action="close-dock">✕</button>
      </div>
      <div id="dock-panel-content">Coming soon.</div>
    </div>
  `;
}

function wireSideDock(container) {
  const panel = container.querySelector('#dock-panel');
  const title = container.querySelector('#dock-panel-title');
  const content = container.querySelector('#dock-panel-content');
  container.querySelectorAll('[data-dock]').forEach(btn => {
    btn.addEventListener('click', () => {
      const dock = btn.dataset.dock;
      if (dock === 'mission') {
        title.textContent = 'Mission';
        content.innerHTML = `<p>Mission system not yet implemented.</p><p>Will display the 3-objective faction mission card here.</p>`;
      } else if (dock === 'log') {
        title.textContent = 'Battle Log';
        content.innerHTML = `<p>Battle log will appear here once combat is wired in.</p>`;
      } else if (dock === 'settings') {
        title.textContent = 'Settings';
        content.innerHTML = `<p>Mute toggle, animation speed, and other preferences.</p>`;
      }
      panel.classList.remove('hidden');
    });
  });
  container.querySelectorAll('[data-action="close-dock"]').forEach(btn => {
    btn.addEventListener('click', () => panel.classList.add('hidden'));
  });
}

function wireBackToHome(container) {
  const btn = container.querySelector('#btn-back-home');
  if (btn) {
    btn.addEventListener('click', () => {
      // Lazy-load to avoid circular import
      import('./home-screen.js').then(m => {
        if (m.mountHomeScreen) m.mountHomeScreen(document.getElementById('app'));
      });
    });
  }
}

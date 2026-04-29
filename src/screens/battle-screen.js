// ─────────────────────────────────────────────────────────────
// Battle Screen — Session C
//
// First playable loop:
//   - Render hand cards from G.player.hand
//   - Render creature/relic slots from G.player/ai.creatures/relics
//   - Tap card to select + show valid slots; tap again to play
//   - Vitals reflect live G state
//   - Gold pulse animation on turn start
//   - NEXT button advances turn (player end → AI turn → player begin)
// ─────────────────────────────────────────────────────────────

import { G } from '../game/state.js';
import { beginTurn, endTurn, playCardFromHand, canAffordInst } from '../game/flow.js';
import { runAiTurn } from '../game/ai.js';
import { createCardElement } from '../game/card-render.js';

let _container = null;
let _selectedHandInstId = null;
let _aiTurnRunning = false;

export function mountBattleScreen(container) {
  _container = container;

  // Build the static shell first
  container.innerHTML = `
    <div id="battle-screen">
      ${renderTopBar()}
      ${renderVitalsRow('ai')}
      ${renderBattlefieldShell('ai')}
      ${renderCenterCombatZone()}
      ${renderBattlefieldShell('player')}
      ${renderVitalsRow('player')}
      ${renderHandFanShell()}
      ${renderActionBar()}
      ${renderSideDock()}
    </div>
  `;

  wireBackToHome(container);
  wireSideDock(container);
  wireActionBar(container);

  // Initial render of dynamic state
  renderAll();

  // Begin the very first turn (player turn 1) — this grants Gold etc.
  // The G state was initialized by home-screen before mounting; we just trigger turn-start.
  beginTurn('player');
  renderAll();
  playGoldPulse('player', G.player.gold);
}

// ── Static skeleton (unchanged from Session B except hand fan slot count) ──

function renderTopBar() {
  return `
    <header id="topbar">
      <div class="logo">⚡ CV</div>
      <nav class="phase-track">
        <div class="phase-pip" data-phase="renew">RNW</div>
        <div class="phase-pip" data-phase="main">MAIN</div>
        <div class="phase-pip" data-phase="combat">CMB</div>
        <div class="phase-pip" data-phase="end">END</div>
      </nav>
      <div class="turn-info" id="turn-info">T:1</div>
      <button id="btn-mute" class="topbar-btn" title="Mute">🔊</button>
      <button id="btn-back-home" class="topbar-btn" title="Home">⌂</button>
    </header>
  `;
}

function renderVitalsRow(side) {
  return `
    <div class="vitals-row vitals-${side}" data-side="${side}">
      <div class="vital-cluster">
        <div class="vital-block ${side === 'player' ? 'tappable' : ''}" data-vital="blood" data-side="${side}">
          <span class="vital-icon">❤</span>
          <span class="vital-num" data-bind="${side}.blood">30</span>
        </div>
        <div class="vital-block" data-vital="bleed" data-side="${side}">
          <span class="vital-icon">🩸</span>
          <span class="vital-num" data-bind="${side}.bleedPool">0</span>
        </div>
        <div class="vital-block ${side === 'player' ? '' : 'dim'}" data-vital="gold" data-side="${side}">
          <span class="vital-icon">⛁</span>
          <span class="vital-num" data-bind="${side}.gold">0/0</span>
        </div>
      </div>
      <div class="relic-strip" data-side="${side}">
        ${[0,1,2,3].map(i => `<div class="relic-slot empty" data-side="${side}" data-relic-slot="${i}"></div>`).join('')}
      </div>
    </div>
  `;
}

function renderBattlefieldShell(side) {
  return `
    <div class="battlefield battlefield-${side}" data-side="${side}">
      <div class="creature-row creature-row-front" data-row="front">
        ${[0,1,2].map(i => renderCreatureSlotShell(side, i, 'front')).join('')}
      </div>
      <div class="creature-row creature-row-back" data-row="back">
        ${[3,4].map(i => renderCreatureSlotShell(side, i, 'back')).join('')}
      </div>
    </div>
  `;
}

function renderCreatureSlotShell(side, idx, row) {
  return `
    <div class="creature-slot creature-slot-${row} empty" data-side="${side}" data-creature-slot="${idx}">
      <div class="token-orbit">
        <div class="token-slot empty" data-token-slot="0"></div>
        <div class="token-slot empty" data-token-slot="1"></div>
        <div class="token-slot empty" data-token-slot="2"></div>
      </div>
      <div class="creature-card-host"></div>
    </div>
  `;
}

function renderCenterCombatZone() {
  return `
    <div id="combat-zone" class="combat-zone">
      <div class="combat-zone-label" id="combat-zone-label">━━━ COMBAT ZONE ━━━</div>
      <div id="gold-pulse-layer"></div>
    </div>
  `;
}

function renderHandFanShell() {
  return `<div id="hand-fan"></div>`;
}

function renderActionBar() {
  return `
    <div id="action-bar">
      <button class="action-btn primary" id="btn-next">NEXT TURN ▶</button>
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

// ── Wire-up helpers ──

function wireBackToHome(container) {
  const btn = container.querySelector('#btn-back-home');
  if (btn) {
    btn.addEventListener('click', () => {
      import('./home-screen.js').then(m => {
        if (m.mountHomeScreen) m.mountHomeScreen(document.getElementById('app'));
      });
    });
  }
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
        content.innerHTML = '<p>Mission system not yet implemented.</p>';
      } else if (dock === 'log') {
        title.textContent = 'Battle Log';
        const lines = (window._battleLog || []).slice(-30).reverse()
          .map(l => `<div class="log-line">${l}</div>`).join('');
        content.innerHTML = lines || '<p>No actions yet.</p>';
      } else if (dock === 'settings') {
        title.textContent = 'Settings';
        content.innerHTML = '<p>Mute / animation speed (coming).</p>';
      }
      panel.classList.remove('hidden');
    });
  });
  container.querySelectorAll('[data-action="close-dock"]').forEach(btn => {
    btn.addEventListener('click', () => panel.classList.add('hidden'));
  });
}

function wireActionBar(container) {
  const next = container.querySelector('#btn-next');
  next.addEventListener('click', async () => {
    if (_aiTurnRunning) return;
    if (G.activePlayer !== 'player') return;
    if (G.winner) { showStatus('Game over.'); return; }

    // Player ends turn → AI takes over
    _selectedHandInstId = null;
    endTurn();
    renderAll();

    // Run AI turn (if AI doesn't immediately win/lose)
    if (G.activePlayer === 'ai' && !G.winner) {
      _aiTurnRunning = true;
      next.disabled = true;
      next.textContent = 'AI THINKING…';
      logEvent('— AI turn begins —');
      playGoldPulse('ai', G.ai.gold);
      await runAiTurn({
        onAction: (a) => {
          if (a.type === 'play') logEvent(`AI plays ${a.card.name}`);
          renderAll();
        },
      });
      _aiTurnRunning = false;
      next.disabled = false;
      next.textContent = 'NEXT TURN ▶';
      // After AI ends turn, beginTurn('player') was called inside endTurn()
      renderAll();
      if (!G.winner) {
        playGoldPulse('player', G.player.gold);
        logEvent(`— Your turn (T${G.turn}) —`);
      }
    }

    if (G.winner) showWinnerBanner();
  });
}

// ── Dynamic rendering ──

function renderAll() {
  if (!_container || !G) return;
  renderVitals();
  renderPhasePips();
  renderTurn();
  renderBattlefield('ai');
  renderBattlefield('player');
  renderHand();
}

function renderVitals() {
  for (const side of ['player', 'ai']) {
    const s = G[side];
    setBoundText(`${side}.blood`, s.blood);
    setBoundText(`${side}.bleedPool`, s.bleedPool);
    const goldText = (G.activePlayer === side && G.phase !== 'end')
      ? `${s.gold}/${s.maxGoldThisTurn}`
      : (side === G.activePlayer ? `${s.gold}/${s.maxGoldThisTurn}` : '-/-');
    setBoundText(`${side}.gold`, goldText);

    // Dim opponent's gold
    const goldBlock = _container.querySelector(`.vital-block[data-vital="gold"][data-side="${side}"]`);
    if (goldBlock) {
      const isMyTurn = G.activePlayer === side;
      goldBlock.classList.toggle('dim', !isMyTurn);
    }
  }
}

function renderPhasePips() {
  _container.querySelectorAll('.phase-pip').forEach(el => {
    el.classList.remove('active');
    if (el.dataset.phase === G.phase) el.classList.add('active');
  });
}

function renderTurn() {
  const el = _container.querySelector('#turn-info');
  if (el) el.textContent = `T:${G.turn}${G.activePlayer === 'ai' ? ' (AI)' : ''}`;
}

function renderBattlefield(side) {
  const slots = G[side].creatures;
  for (let i = 0; i < 5; i++) {
    const slotEl = _container.querySelector(`.creature-slot[data-side="${side}"][data-creature-slot="${i}"]`);
    if (!slotEl) continue;
    const host = slotEl.querySelector('.creature-card-host');
    host.innerHTML = '';
    if (slots[i]) {
      slotEl.classList.remove('empty');
      const cardEl = createCardElement(slots[i], 'battlefield');
      host.appendChild(cardEl);
    } else {
      slotEl.classList.add('empty');
      host.innerHTML = '<div class="creature-card empty"></div>';
    }
  }
}

function renderHand() {
  const fan = _container.querySelector('#hand-fan');
  fan.innerHTML = '';
  const hand = G.player.hand;
  const total = hand.length;
  if (total === 0) return;

  hand.forEach((inst, idx) => {
    const center = (total - 1) / 2;
    const offset = idx - center;
    const angleStep = total > 5 ? 4 : 6;
    const rotation = offset * angleStep;
    const yLift = Math.abs(offset) * 4;

    const slot = document.createElement('div');
    slot.className = 'hand-slot';
    slot.style.transform = `rotate(${rotation}deg) translateY(${yLift}px)`;
    slot.dataset.handIdx = idx;
    slot.dataset.instId = inst.instId;

    const card = createCardElement(inst, 'hand');

    // Affordability + selected state
    const affordable = canAffordInst(inst) && G.activePlayer === 'player' && G.phase === 'main' && inst.type !== 'Spell';
    if (!affordable) card.classList.add('unaffordable');
    if (_selectedHandInstId === inst.instId) {
      card.classList.add('selected');
      slot.classList.add('selected');
    }

    // Tap handler
    card.addEventListener('click', (ev) => {
      ev.stopPropagation();
      handleHandCardTap(inst);
    });

    slot.appendChild(card);
    fan.appendChild(slot);
  });
}

// ── Tap interactions ──

function handleHandCardTap(inst) {
  if (G.activePlayer !== 'player' || G.phase !== 'main') {
    showStatus('Not your turn.');
    return;
  }

  if (inst.type === 'Spell') {
    showStatus('Spells coming in a future session.');
    return;
  }

  if (!canAffordInst(inst)) {
    showStatus(`Not enough resources. Need ${inst.goldCost}G + ${inst.bloodCost}B`);
    return;
  }

  // Tap-to-select then tap-to-confirm pattern
  if (_selectedHandInstId === inst.instId) {
    // Confirm: play it
    const result = playCardFromHand(inst);
    if (result.ok) {
      logEvent(`You play ${inst.name}`);
      _selectedHandInstId = null;
      renderAll();
    } else {
      showStatus(result.error);
    }
  } else {
    // Select
    _selectedHandInstId = inst.instId;
    showStatus(`Tap again to play ${inst.name}.`);
    renderHand();
  }
}

// ── Helpers ──

function setBoundText(bind, value) {
  const el = _container.querySelector(`[data-bind="${bind}"]`);
  if (el) el.textContent = value;
}

function showStatus(text) {
  const z = _container.querySelector('#combat-zone-label');
  if (!z) return;
  z.textContent = text;
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => {
    z.textContent = '━━━ COMBAT ZONE ━━━';
  }, 1800);
}

function logEvent(text) {
  window._battleLog = window._battleLog || [];
  window._battleLog.push(text);
}

function showWinnerBanner() {
  const z = _container.querySelector('#combat-zone-label');
  if (!z) return;
  z.textContent = G.winner === 'player' ? '⚡ VICTORY ⚡' : '💀 DEFEAT 💀';
  z.style.fontSize = '20px';
  z.style.color = G.winner === 'player' ? 'var(--gold-bright)' : 'var(--bleed-red)';
}

// ── Gold pulse animation ──

function playGoldPulse(side, amount) {
  if (!_container || amount <= 0) return;
  const layer = _container.querySelector('#gold-pulse-layer');
  if (!layer) return;

  const targetVital = _container.querySelector(`.vital-block[data-vital="gold"][data-side="${side}"]`);
  if (!targetVital) return;
  const targetRect = targetVital.getBoundingClientRect();
  const sourceRect = layer.getBoundingClientRect();

  // Spawn N coins from the center, fly to vital
  for (let i = 0; i < amount; i++) {
    const coin = document.createElement('div');
    coin.className = 'gold-coin';
    coin.textContent = '⛁';
    layer.appendChild(coin);

    // Stagger
    requestAnimationFrame(() => {
      setTimeout(() => {
        const dx = (targetRect.left + targetRect.width/2) - (sourceRect.left + sourceRect.width/2);
        const dy = (targetRect.top + targetRect.height/2) - (sourceRect.top + sourceRect.height/2);
        coin.style.transform = `translate(${dx}px, ${dy}px) scale(0.4)`;
        coin.style.opacity = '0';
      }, i * 90);
    });

    setTimeout(() => coin.remove(), i * 90 + 800);
  }
}

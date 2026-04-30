// ─────────────────────────────────────────────────────────────
// Battle Screen — Overlay-on-Background structure
//
// All UI chrome (frames, side rails, skylines, phase pills, hex
// END TURN frame) is provided by /public/images/ui/battlefield-bg.jpg.
// This module just anchors dynamic elements to %-coords on top.
// ─────────────────────────────────────────────────────────────

import { G } from '../game/state.js';
import { beginTurn, endTurn, playCardFromHand, canAffordInst } from '../game/flow.js';
import { runAiTurn } from '../game/ai.js';
import { createCardElement } from '../game/card-render.js';

let _container = null;
let _selectedHandInstId = null;
let _aiTurnRunning = false;
let _previewOpen = false;
let _longPressTimer = null;

export function mountBattleScreen(container) {
  _container = container;

  container.innerHTML = `
    <div id="battle-screen">
      <!-- The playfield locks to bg image's aspect ratio (1170:1733).
           Letterbox bars (black) appear above/below on tall phones. -->
      <div class="battle-playfield">
        <!-- Dynamic overlays anchored to %-coords of the playfield -->
        <div class="overlay-layer">
          ${renderTopBarOverlay()}
          ${renderVitalsOverlay('opponent')}
          ${renderDeckIndicator()}
          ${renderSlotsOverlay('opponent')}
          ${renderSlotsOverlay('player')}
          ${renderVitalsOverlay('player')}
          ${renderHandFan()}
          ${renderEndTurnButton()}
          ${renderSideDock()}
        </div>

        <!-- Status text appears in combat zone band -->
        <div id="status-text"></div>

        <!-- Gold coin animation layer -->
        <div id="gold-pulse-layer"></div>
      </div>

      <!-- Side panel + card preview overlays (top-most layer, screen-fixed) -->
      ${renderDockPanel()}
      <div id="card-preview-overlay" class="hidden"></div>
    </div>
  `;

  wireEvents();
  renderAll();

  // Begin first turn
  beginTurn('player');
  renderAll();
  playGoldPulse('player', G.player.gold);
}

// ── Static overlay templates ──

function renderTopBarOverlay() {
  // The phase pills + TURN text + gear icon are baked into the bg.
  // We only overlay: the active phase highlight + the dynamic turn number.
  return `
    <div class="overlay-topbar">
      <div class="overlay-phase-highlight" id="phase-highlight"></div>
      <div class="overlay-turn-text" id="turn-text">TURN 1</div>
      <button class="overlay-home-btn" id="btn-back-home" title="Home">⌂</button>
    </div>
  `;
}

function renderVitalsOverlay(side) {
  // side = 'opponent' (top) or 'player' (bottom)
  // The avatar ring + "OPPONENT/YOU" label can be in the bg, but we
  // render the dynamic numbers on top.
  return `
    <div class="overlay-vitals overlay-vitals-${side}">
      <div class="vitals-avatar" data-vitals-avatar="${side}">
        <div class="vitals-avatar-placeholder">${side === 'player' ? '🧛' : '👤'}</div>
      </div>
      <div class="vitals-label">${side === 'player' ? 'YOU' : 'OPPONENT'}</div>
      <div class="vitals-stats">
        <span class="vital-stat">
          <span class="vital-icon">❤</span>
          <span class="vital-num" data-bind="${who(side)}.blood">30</span>
        </span>
        <span class="vital-stat">
          <span class="vital-icon">🩸</span>
          <span class="vital-num" data-bind="${who(side)}.bleedPool">0</span>
        </span>
        <span class="vital-stat gold-stat ${side === 'opponent' ? 'dim' : ''}" data-vital="gold" data-side="${who(side)}">
          <span class="vital-icon">⛁</span>
          <span class="vital-num" data-bind="${who(side)}.gold">0/0</span>
        </span>
      </div>
    </div>
  `;
}

function renderDeckIndicator() {
  return `
    <div class="overlay-deck">
      <span class="deck-stack">📚</span>
      <span class="deck-count" data-bind="opponent.deck.length">x35</span>
    </div>
  `;
}

function renderSlotsOverlay(side) {
  // 4 creature slots positioned over the bg's drawn slot frames
  const sideClass = side === 'opponent' ? 'opp' : 'pla';
  return `
    <div class="overlay-slots overlay-slots-${sideClass}">
      ${[0, 1, 2, 3].map(i => `
        <div class="board-slot" data-side="${who(side)}" data-slot-idx="${i}">
          <div class="slot-token-orbit">
            <div class="token-mini" data-token-idx="0"></div>
            <div class="token-mini" data-token-idx="1"></div>
            <div class="token-mini" data-token-idx="2"></div>
          </div>
          <div class="slot-card-host"></div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderHandFan() {
  return `<div id="hand-fan-overlay"></div>`;
}

function renderEndTurnButton() {
  return `
    <button id="btn-end-turn" class="overlay-end-turn">
      <span>END</span>
      <span>TURN</span>
    </button>
  `;
}

function renderSideDock() {
  return `
    <aside id="side-dock-overlay">
      <button class="dock-btn" data-dock="mission" title="Mission">📋</button>
      <button class="dock-btn" data-dock="log" title="Log">📜</button>
      <button class="dock-btn" data-dock="settings" title="Settings">⚙</button>
    </aside>
  `;
}

function renderDockPanel() {
  return `
    <div id="dock-panel" class="hidden">
      <div class="dock-panel-header">
        <span id="dock-panel-title">Panel</span>
        <button class="dock-panel-close" data-action="close-dock" aria-label="Close">✕</button>
      </div>
      <div id="dock-panel-content">Coming soon.</div>
    </div>
  `;
}

// ── Event wiring ──

function wireEvents() {
  // Back to home
  _container.querySelector('#btn-back-home')?.addEventListener('click', () => {
    import('./home-screen.js').then(m => m.mountHomeScreen?.(document.getElementById('app')));
  });

  // End turn
  _container.querySelector('#btn-end-turn').addEventListener('click', onEndTurn);

  // Side dock
  _container.querySelectorAll('[data-dock]').forEach(btn => {
    btn.addEventListener('click', () => openDock(btn.dataset.dock));
  });
  _container.querySelector('[data-action="close-dock"]')?.addEventListener('click', closeDock);

  // Card preview overlay — tap anywhere to dismiss
  const preview = _container.querySelector('#card-preview-overlay');
  preview.addEventListener('click', closePreview);
}

async function onEndTurn() {
  if (_aiTurnRunning) return;
  if (G.activePlayer !== 'player') return;
  if (G.winner) { showStatus('Game over.'); return; }

  _selectedHandInstId = null;
  endTurn();
  renderAll();

  if (G.activePlayer === 'ai' && !G.winner) {
    _aiTurnRunning = true;
    const btn = _container.querySelector('#btn-end-turn');
    btn.classList.add('disabled');

    logEvent('— AI turn begins —');
    playGoldPulse('ai', G.ai.gold);

    await runAiTurn({
      onAction: (a) => {
        if (a.type === 'play') logEvent(`AI plays ${a.card.name}`);
        renderAll();
      },
    });

    _aiTurnRunning = false;
    btn.classList.remove('disabled');
    renderAll();

    if (!G.winner) {
      playGoldPulse('player', G.player.gold);
      logEvent(`— Your turn (T${G.turn}) —`);
    }
  }

  if (G.winner) showWinner();
}

// ── Hand interactions: tap to select, tap again to play, long-press to preview ──

function attachHandCardEvents(slotEl, inst) {
  let pressed = false;
  let moved = false;

  const startPress = (e) => {
    pressed = true;
    moved = false;
    clearTimeout(_longPressTimer);
    _longPressTimer = setTimeout(() => {
      if (pressed && !moved) {
        openPreview(inst);
      }
    }, 450);
  };

  const cancelPress = () => {
    pressed = false;
    clearTimeout(_longPressTimer);
  };

  const onMove = () => {
    moved = true;
    cancelPress();
  };

  slotEl.addEventListener('touchstart', startPress, { passive: true });
  slotEl.addEventListener('mousedown', startPress);
  slotEl.addEventListener('touchmove', onMove, { passive: true });
  slotEl.addEventListener('touchend', (e) => {
    cancelPress();
    if (!moved && !_previewOpen) {
      e.preventDefault();
      onHandCardTap(inst);
    }
  }, { passive: false });
  slotEl.addEventListener('mouseup', () => {
    cancelPress();
    if (!moved && !_previewOpen) onHandCardTap(inst);
  });
  slotEl.addEventListener('mouseleave', cancelPress);
}

function onHandCardTap(inst) {
  if (G.activePlayer !== 'player' || G.phase !== 'main') {
    showStatus('Not your turn.');
    return;
  }
  if (inst.type === 'Spell') {
    showStatus('Spells coming in a future session.');
    return;
  }
  if (!canAffordInst(inst)) {
    showStatus(`Need ${inst.goldCost} gold + ${inst.bloodCost} blood`);
    return;
  }

  if (_selectedHandInstId === inst.instId) {
    const result = playCardFromHand(inst);
    if (result.ok) {
      logEvent(`You play ${inst.name}`);
      _selectedHandInstId = null;
      renderAll();
    } else {
      showStatus(result.error);
    }
  } else {
    _selectedHandInstId = inst.instId;
    showStatus(`Tap again to play ${inst.name}`);
    renderHand();
  }
}

// ── Preview overlay (long-press) ──

function openPreview(inst) {
  _previewOpen = true;
  const overlay = _container.querySelector('#card-preview-overlay');
  overlay.innerHTML = '';
  const card = createCardElement(inst, 'preview');
  overlay.appendChild(card);
  overlay.classList.remove('hidden');
}

function closePreview() {
  _previewOpen = false;
  const overlay = _container.querySelector('#card-preview-overlay');
  overlay.classList.add('hidden');
  setTimeout(() => { overlay.innerHTML = ''; }, 250);
}

// ── Side dock ──

function openDock(which) {
  const panel = _container.querySelector('#dock-panel');
  const title = _container.querySelector('#dock-panel-title');
  const content = _container.querySelector('#dock-panel-content');
  if (which === 'mission') {
    title.textContent = 'Mission';
    content.innerHTML = '<p>Mission system not yet implemented.</p>';
  } else if (which === 'log') {
    title.textContent = 'Battle Log';
    const lines = (window._battleLog || []).slice(-30).reverse()
      .map(l => `<div class="log-line">${escapeHtml(l)}</div>`).join('');
    content.innerHTML = lines || '<p>No actions yet.</p>';
  } else if (which === 'settings') {
    title.textContent = 'Settings';
    content.innerHTML = `
      <p>Mute toggle and animation speed coming.</p>
      <button class="home-btn home-btn-warn" id="btn-end-game">End Game (return home)</button>
    `;
    setTimeout(() => {
      _container.querySelector('#btn-end-game')?.addEventListener('click', () => {
        if (confirm('End this battle and return home?')) {
          import('./home-screen.js').then(m => m.mountHomeScreen?.(document.getElementById('app')));
        }
      });
    }, 0);
  }
  panel.classList.remove('hidden');
}

function closeDock() {
  _container.querySelector('#dock-panel').classList.add('hidden');
}

// ── Render passes ──

function renderAll() {
  if (!_container || !G) return;
  renderTopBar();
  renderVitals();
  renderDeck();
  renderBoard('player');
  renderBoard('ai');
  renderHand();
}

function renderTopBar() {
  const turnText = _container.querySelector('#turn-text');
  if (turnText) turnText.textContent = `TURN ${G.turn}${G.activePlayer === 'ai' ? ' (AI)' : ''}`;

  // Highlight active phase by positioning highlight overlay over the active pill.
  // In our overlay model, we use position-percentages over the bg-drawn pills.
  const highlight = _container.querySelector('#phase-highlight');
  if (highlight) highlight.dataset.phase = G.phase;
}

function renderVitals() {
  for (const side of ['player', 'ai']) {
    const s = G[side];
    setBoundText(`${side}.blood`, s.blood);
    setBoundText(`${side}.bleedPool`, s.bleedPool);
    const goldText = (G.activePlayer === side)
      ? `${s.gold}/${s.maxGoldThisTurn}`
      : '-/-';
    setBoundText(`${side}.gold`, goldText);

    const goldStat = _container.querySelector(`.gold-stat[data-side="${side}"]`);
    if (goldStat) {
      goldStat.classList.toggle('dim', G.activePlayer !== side);
    }
  }
}

function renderDeck() {
  const oppDeck = G.ai.deck.length;
  const el = _container.querySelector('[data-bind="opponent.deck.length"]');
  if (el) el.textContent = `x${oppDeck}`;
}

function renderBoard(side) {
  const slots = G[side].creatures;
  const sideClass = side === 'ai' ? 'opp' : 'pla';
  for (let i = 0; i < 4; i++) {
    const slotEl = _container.querySelector(`.overlay-slots-${sideClass} .board-slot[data-slot-idx="${i}"]`);
    if (!slotEl) continue;
    const host = slotEl.querySelector('.slot-card-host');
    host.innerHTML = '';
    const inst = slots[i];
    if (inst) {
      slotEl.classList.remove('empty');
      const cardEl = createCardElement(inst, 'battlefield');
      host.appendChild(cardEl);
      // Render orbiting tokens
      const orbit = slotEl.querySelector('.slot-token-orbit');
      const tokenSlots = orbit.querySelectorAll('.token-mini');
      for (let t = 0; t < 3; t++) {
        const tokName = inst.tokens?.[t];
        tokenSlots[t].textContent = tokName ? tokenGlyph(tokName) : '';
        tokenSlots[t].classList.toggle('filled', !!tokName);
      }
    } else {
      slotEl.classList.add('empty');
      // Clear token icons
      slotEl.querySelectorAll('.token-mini').forEach(t => {
        t.textContent = '';
        t.classList.remove('filled');
      });
    }
  }
}

function renderHand() {
  const fan = _container.querySelector('#hand-fan-overlay');
  fan.innerHTML = '';
  const hand = G.player.hand;
  const total = hand.length;
  if (total === 0) return;

  hand.forEach((inst, idx) => {
    const center = (total - 1) / 2;
    const offset = idx - center;
    const angleStep = total > 6 ? 5 : 7;
    const rotation = offset * angleStep;
    const yLift = Math.abs(offset) * 6;
    const xOffset = offset * 38; // horizontal spacing

    const slot = document.createElement('div');
    slot.className = 'hand-slot';
    slot.style.transform = `translateX(${xOffset}px) translateY(${yLift}px) rotate(${rotation}deg)`;
    slot.style.zIndex = 10 - Math.abs(offset);
    slot.dataset.handIdx = idx;
    slot.dataset.instId = inst.instId;

    const card = createCardElement(inst, 'hand');

    const affordable = canAffordInst(inst) && G.activePlayer === 'player' && G.phase === 'main' && inst.type !== 'Spell';
    if (!affordable) card.classList.add('unaffordable');
    if (_selectedHandInstId === inst.instId) {
      card.classList.add('selected');
      slot.classList.add('selected');
      slot.style.transform = `translateX(${xOffset}px) translateY(-50px) rotate(0deg) scale(1.18)`;
      slot.style.zIndex = 100;
    }

    attachHandCardEvents(slot, inst);
    slot.appendChild(card);
    fan.appendChild(slot);
  });
}

// ── Helpers ──

function who(side) { return side === 'opponent' ? 'ai' : 'player'; }

function setBoundText(bind, value) {
  const el = _container.querySelector(`[data-bind="${bind}"]`);
  if (el) el.textContent = value;
}

function showStatus(text) {
  const el = _container.querySelector('#status-text');
  if (!el) return;
  el.textContent = text;
  el.classList.add('visible');
  clearTimeout(showStatus._t);
  showStatus._t = setTimeout(() => el.classList.remove('visible'), 1800);
}

function logEvent(text) {
  window._battleLog = window._battleLog || [];
  window._battleLog.push(text);
}

function showWinner() {
  const el = _container.querySelector('#status-text');
  if (!el) return;
  el.textContent = G.winner === 'player' ? '⚡ VICTORY ⚡' : '💀 DEFEAT 💀';
  el.classList.add('visible', 'big');
}

function tokenGlyph(name) {
  return ({ Raven: '🐦', Bat: '🦇', Wolf: '🐺', Zombie: '💀' })[name] || '◇';
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Gold coin animation ──

function playGoldPulse(side, amount) {
  if (!_container || amount <= 0) return;
  const layer = _container.querySelector('#gold-pulse-layer');
  if (!layer) return;
  const targetVital = _container.querySelector(`.gold-stat[data-side="${side}"]`);
  if (!targetVital) return;
  const targetRect = targetVital.getBoundingClientRect();
  const sourceRect = layer.getBoundingClientRect();

  for (let i = 0; i < amount; i++) {
    const coin = document.createElement('div');
    coin.className = 'gold-coin';
    layer.appendChild(coin);

    requestAnimationFrame(() => {
      setTimeout(() => {
        const dx = (targetRect.left + targetRect.width/2) - (sourceRect.left + sourceRect.width/2);
        const dy = (targetRect.top + targetRect.height/2) - (sourceRect.top + sourceRect.height/2);
        coin.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4)`;
        coin.style.opacity = '0';
      }, i * 100);
    });

    setTimeout(() => coin.remove(), i * 100 + 800);
  }
}

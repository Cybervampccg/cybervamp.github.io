// ─────────────────────────────────────────────────────────────
// Battle Screen — Overlay-on-Background structure with Template Mode
//
// Template mode (opts.templateMode = true) replaces the bg image with
// labeled colored regions to verify anchor positions.
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

export function mountBattleScreen(container, opts = {}) {
  _container = container;
  const templateMode = opts.templateMode === true;
  const playfieldClass = templateMode ? 'battle-playfield template-mode' : 'battle-playfield';

  container.innerHTML = `
    <div id="battle-screen">
      <div class="${playfieldClass}">
        ${templateMode ? renderTemplateRegions() : ''}
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
        <div id="status-text"></div>
        <div id="gold-pulse-layer"></div>
      </div>
      ${renderDockPanel()}
      <div id="card-preview-overlay" class="hidden"></div>
    </div>
  `;

  wireEvents();
  renderAll();
  beginTurn('player');
  renderAll();
  playGoldPulse('player', G.player.gold);

  if (templateMode) {
    console.log('[Cybervamp] Battle screen mounted in TEMPLATE MODE');
    showStatus('TEMPLATE MODE — anchor preview');
  }
}

function renderTemplateRegions() {
  const regions = [
    ['PHASE PILLS',  '2%',    '12%',   '42%', '3%',    'rgba(255,80,80,.35)'],
    ['TURN PILL',    '2%',    '55%',   '23%', '3%',    'rgba(255,200,0,.35)'],
    ['GEAR',         '1.5%',  '83%',   '9%',  '4%',    'rgba(180,180,180,.35)'],
    ['OPP AVATAR',   '8.5%',  '2%',    '12%', '10%',   'rgba(150,80,200,.4)'],
    ['OPP VITALS',   '12%',   '14.5%', '50%', '4.5%',  'rgba(220,60,60,.3)'],
    ['DECK',         '10%',   '80%',   '12%', '11%',   'rgba(60,180,80,.4)'],
    ['OPP TOKENS',   '21%',   '18%',   '47%', '2%',    'rgba(180,140,230,.4)'],
    ['OPP SLOT 1',   '23.5%', '15.5%', '16%', '14.5%', 'rgba(220,60,60,.25)'],
    ['OPP SLOT 2',   '23.5%', '33.5%', '16%', '14.5%', 'rgba(220,60,60,.25)'],
    ['OPP SLOT 3',   '23.5%', '51.5%', '16%', '14.5%', 'rgba(220,60,60,.25)'],
    ['OPP SLOT 4',   '23.5%', '69.5%', '16%', '14.5%', 'rgba(220,60,60,.25)'],
    ['COMBAT ZONE',  '42%',   '5%',    '90%', '12%',   'rgba(180,80,200,.3)'],
    ['PLA SLOT 1',   '55%',   '15.5%', '16%', '14%',   'rgba(150,80,220,.25)'],
    ['PLA SLOT 2',   '55%',   '33.5%', '16%', '14%',   'rgba(150,80,220,.25)'],
    ['PLA SLOT 3',   '55%',   '51.5%', '16%', '14%',   'rgba(150,80,220,.25)'],
    ['PLA SLOT 4',   '55%',   '69.5%', '16%', '14%',   'rgba(150,80,220,.25)'],
    ['PLA AVATAR',   '69%',   '2%',    '12%', '10%',   'rgba(150,80,200,.4)'],
    ['PLA VITALS',   '73%',   '14.5%', '30%', '4.5%',  'rgba(220,60,60,.3)'],
    ['GOLD PILL',    '75%',   '22%',   '18%', '4%',    'rgba(255,200,0,.4)'],
    ['SIDE DOCK',    '68%',   '88%',   '10%', '19%',   'rgba(120,180,200,.35)'],
    ['HAND FAN',     '80%',   '2%',    '96%', '13%',   'rgba(150,80,220,.25)'],
    ['END TURN HEX', '92.5%', '82%',   '16%', '6.2%',  'rgba(220,60,60,.55)'],
  ];
  return regions.map(([name, top, left, w, h, bg]) => `
    <div class="template-region" style="position:absolute; top:${top}; left:${left}; width:${w}; height:${h}; background:${bg}; border:2px dashed rgba(255,255,255,.4); display:flex; align-items:center; justify-content:center; font-size:10px; color:white; font-family:monospace; text-align:center; text-shadow:0 1px 2px black; z-index:0;">
      <span>${name}</span>
    </div>
  `).join('');
}

function renderTopBarOverlay() {
  return `
    <div class="overlay-phase-highlight" id="phase-highlight"></div>
    <div class="overlay-turn-text" id="turn-text">TURN 1</div>
    <button class="overlay-home-btn" id="btn-back-home" title="Home">⌂</button>
  `;
}

function renderVitalsOverlay(side) {
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

function wireEvents() {
  _container.querySelector('#btn-back-home')?.addEventListener('click', () => {
    import('./home-screen.js').then(m => m.mountHomeScreen?.(document.getElementById('app')));
  });
  _container.querySelector('#btn-end-turn').addEventListener('click', onEndTurn);
  _container.querySelectorAll('[data-dock]').forEach(btn => {
    btn.addEventListener('click', () => openDock(btn.dataset.dock));
  });
  _container.querySelector('[data-action="close-dock"]')?.addEventListener('click', closeDock);
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

function attachHandCardEvents(slotEl, inst) {
  let pressed = false;
  let moved = false;
  const startPress = () => {
    pressed = true; moved = false;
    clearTimeout(_longPressTimer);
    _longPressTimer = setTimeout(() => {
      if (pressed && !moved) openPreview(inst);
    }, 450);
  };
  const cancelPress = () => { pressed = false; clearTimeout(_longPressTimer); };
  const onMove = () => { moved = true; cancelPress(); };
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
      <p>Mute and animation speed coming.</p>
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
  const highlight = _container.querySelector('#phase-highlight');
  if (highlight) highlight.dataset.phase = G.phase;
}

function renderVitals() {
  for (const side of ['player', 'ai']) {
    const s = G[side];
    setBoundText(`${side}.blood`, s.blood);
    setBoundText(`${side}.bleedPool`, s.bleedPool);
    const goldText = (G.activePlayer === side) ? `${s.gold}/${s.maxGoldThisTurn}` : '-/-';
    setBoundText(`${side}.gold`, goldText);
    const goldStat = _container.querySelector(`.gold-stat[data-side="${side}"]`);
    if (goldStat) goldStat.classList.toggle('dim', G.activePlayer !== side);
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
    } else {
      slotEl.classList.add('empty');
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
    const angleStep = total > 6 ? 4 : 6;
    const rotation = offset * angleStep;
    const yLift = Math.abs(offset) * 4;
    const xOffsetPct = offset * 9;

    const slot = document.createElement('div');
    slot.className = 'hand-slot';
    slot.style.transform = `translateX(${xOffsetPct}%) translateY(${yLift}px) rotate(${rotation}deg)`;
    slot.style.zIndex = 10 - Math.abs(offset);
    slot.dataset.handIdx = idx;
    slot.dataset.instId = inst.instId;

    const card = createCardElement(inst, 'hand');
    const affordable = canAffordInst(inst) && G.activePlayer === 'player' && G.phase === 'main' && inst.type !== 'Spell';
    if (!affordable) card.classList.add('unaffordable');
    if (_selectedHandInstId === inst.instId) {
      card.classList.add('selected');
      slot.classList.add('selected');
      slot.style.transform = `translateX(0%) translateY(-90%) rotate(0deg) scale(1.4)`;
      slot.style.zIndex = 100;
    }
    attachHandCardEvents(slot, inst);
    slot.appendChild(card);
    fan.appendChild(slot);
  });
}

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

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

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

// ─────────────────────────────────────────────────────────────
// Battle Screen — Session D-FIX-2
// Targeted fixes for "can't attack on my turn":
//   1. GO TO COMBAT button visibility expanded — shows during YOUR turn
//      whenever you have any creature on your side, even if phase != 'main'
//   2. Console diagnostic logs to show why button is/isn't visible
//   3. Lenient phase check — combat works in 'main' OR 'renew' phase
// ─────────────────────────────────────────────────────────────

import { G } from '../game/state.js';
import { beginTurn, endTurn, playCardFromHand, canAffordInst } from '../game/flow.js';
import { runAiTurn } from '../game/ai.js';
import { createCardElement } from '../game/card-render.js';
import { sacrificeCreature, isCreatureBoardFull, discardFromHand } from '../game/sacrifice.js';
import {
  declareAttacker, undeclareAttacker, getAttackers,
  assignBlocker, resolveCombat, resolvePostBattle, checkWinCondition,
  countAvailableAttackers, countAvailableBlockers,
  aiDeclareAllAttackers, aiAssignBlockers,
} from '../game/combat.js';

const HAND_CAP = 7;

const ACTION_BTN_BASE_STYLE = `
  position: absolute;
  top: 92.5%;
  right: 1.5%;
  width: 16%;
  height: 6.2%;
  font-family: 'Cinzel Decorative', serif;
  font-weight: 700;
  font-size: 11px;
  letter-spacing: 1px;
  border: 1px solid rgba(255, 200, 200, 0.4);
  clip-path: polygon(15% 0%, 85% 0%, 100% 50%, 85% 100%, 15% 100%, 0% 50%);
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-shadow: 0 1px 3px rgba(0,0,0,0.9);
  z-index: 7;
  line-height: 1.1;
`;

let _container = null;
let _aiTurnRunning = false;
let _previewInst = null;
let _mode = 'normal';
let _pendingPlayInst = null;
let _pendingBlockerForAttackerIdx = null;
let _resumeBlockChoice = null;

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
          ${renderActionButtons()}
          ${renderSideDock()}
        </div>
        <div id="status-text"></div>
        <div id="gold-pulse-layer"></div>
        <div id="mode-banner" class="hidden"></div>
        <div id="combat-fx-layer" style="position:absolute; inset:0; pointer-events:none; z-index:50;"></div>
      </div>
      ${renderDockPanel()}
      <div id="card-preview-overlay" class="hidden"></div>
    </div>
  `;

  wireEvents();
  beginTurn('player');
  enforceHandCap();
  renderAll();
  playGoldPulse('player', G.player.gold);

  console.log('[battle] mounted. G.phase=', G.phase, 'G.activePlayer=', G.activePlayer);
  if (templateMode) showStatus('TEMPLATE MODE — anchor preview');
}

function renderActionButtons() {
  const endTurnStyle = ACTION_BTN_BASE_STYLE +
    `background: linear-gradient(180deg, rgba(185, 28, 44, 0.8) 0%, rgba(110, 13, 24, 0.9) 100%); color: #fde047;`;
  const combatStyle = ACTION_BTN_BASE_STYLE +
    `background: linear-gradient(180deg, #c2410c 0%, #7c2d12 100%); color: #ffedd5; border-color: rgba(255, 180, 100, 0.6);`;
  const confirmStyle = ACTION_BTN_BASE_STYLE +
    `background: linear-gradient(180deg, #b45309 0%, #78350f 100%); color: #fde047; border-color: rgba(253, 224, 71, 0.7);`;

  return `
    <button id="btn-combat" style="${combatStyle} display:none;">
      <span>GO TO</span><span>COMBAT</span>
    </button>
    <button id="btn-confirm" style="${confirmStyle} display:none;">
      <span>CONFIRM</span><span>ATTACK</span>
    </button>
    <button id="btn-end-turn" style="${endTurnStyle}">
      <span>END</span><span>TURN</span>
    </button>
  `;
}

function enforceHandCap() {
  if (G.activePlayer !== 'player') return;
  if ((G.player.hand?.length || 0) > HAND_CAP) {
    _mode = 'discard';
    showModeBanner(`HAND OVER LIMIT — tap a card to discard (${G.player.hand.length}/${HAND_CAP})`);
  } else if (_mode === 'discard') {
    _mode = 'normal';
    hideModeBanner();
  }
}

function showModeBanner(text) {
  const banner = _container.querySelector('#mode-banner');
  if (!banner) return;
  banner.innerHTML = text;
  banner.classList.remove('hidden');
}

function hideModeBanner() {
  const banner = _container.querySelector('#mode-banner');
  if (!banner) return;
  banner.classList.add('hidden');
  banner.innerHTML = '';
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
    ['PLA VITALS',   '73%',   '14.5%', '60%', '4.5%',  'rgba(220,60,60,.3)'],
    ['SIDE DOCK',    '68%',   '88%',   '10%', '19%',   'rgba(120,180,200,.35)'],
    ['HAND FAN',     '78%',   '2%',    '96%', '14%',   'rgba(150,80,220,.25)'],
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
          <div class="slot-card-host"></div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderHandFan() {
  return `<div id="hand-fan-overlay"></div>`;
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
  _container.querySelector('#btn-combat').addEventListener('click', onGoToCombat);
  _container.querySelector('#btn-confirm').addEventListener('click', onConfirmAction);
  _container.querySelectorAll('[data-dock]').forEach(btn => {
    btn.addEventListener('click', () => openDock(btn.dataset.dock));
  });
  _container.querySelector('[data-action="close-dock"]')?.addEventListener('click', closeDock);
}

// ─── COMBAT ENTRY ───
// Loosened: triggers when it's your turn and you have any creature
// Diagnostic logging shows why button is/isn't visible

function onGoToCombat() {
  console.log('[combat] GO TO COMBAT tapped. mode=', _mode, 'phase=', G.phase, 'active=', G.activePlayer);

  if (G.activePlayer !== 'player') {
    showStatus('Not your turn');
    return;
  }
  if (G.winner) return;
  if (_mode !== 'normal') {
    showStatus('Finish current action first');
    return;
  }

  const attackerCount = countAvailableAttackers('player');
  console.log('[combat] available attackers:', attackerCount);

  if (attackerCount === 0) {
    // Diagnostic: enumerate creatures and reasons
    const reasons = [];
    G.player.creatures.forEach((c, i) => {
      if (!c) reasons.push(`slot ${i}: empty`);
      else {
        const issues = [];
        if (c.exhausted) issues.push('exhausted');
        if (c.overexhausted) issues.push('overexhausted');
        if ((c.power || 0) <= 0) issues.push(`power=${c.power || 0}`);
        if (issues.length === 0) issues.push('OK (should attack)');
        reasons.push(`slot ${i}: ${c.name} - ${issues.join(', ')}`);
      }
    });
    console.log('[combat] no attackers because:', reasons);
    showStatus('No creatures available to attack');
    return;
  }

  _mode = 'combat-attackers';
  G.phase = 'combat';
  showModeBanner(`<div>⚔ COMBAT — tap your creatures to attack with them</div><div style="font-size:11px; color:#fde047; margin-top:4px">Then tap CONFIRM ATTACK</div>`);
  renderAll();
}

async function onConfirmAction() {
  if (_mode === 'combat-attackers') {
    const attackers = getAttackers('player');
    if (attackers.length === 0) {
      cancelCombat();
      return;
    }
    await runPlayerCombatResolution();
  }
}

function cancelCombat() {
  for (const c of G.player.creatures) {
    if (c) delete c._attacking;
  }
  _mode = 'normal';
  G.phase = 'main';
  hideModeBanner();
  renderAll();
}

async function runPlayerCombatResolution() {
  try {
    showModeBanner(`<div>⏳ AI is choosing blockers...</div>`);
    await delay(600);
    aiAssignBlockers('ai', 'player');
    renderAll();
    await delay(400);

    showModeBanner(`<div>💥 RESOLVING COMBAT</div>`);
    const events = resolveCombat('player', 'ai');
    await playCombatEvents(events);

    await delay(400);
    showModeBanner(`<div>🩸 BLEED RESOLVES</div>`);
    const bleedEvents = resolvePostBattle();
    await playBleedEvents(bleedEvents);
    renderAll();

    checkWinCondition();
    if (G.winner) {
      showWinner();
      hideModeBanner();
      return;
    }

    _mode = 'normal';
    G.phase = 'main';
    hideModeBanner();
    renderAll();
  } catch (err) {
    console.error('[combat] player combat error', err);
    _mode = 'normal';
    G.phase = 'main';
    hideModeBanner();
    showStatus('Combat error — see console');
    renderAll();
  }
}

async function runAiCombatPhase() {
  try {
    if (G.winner) return;
    if (countAvailableAttackers('ai') === 0) {
      console.log('[combat] AI has no attackers, skipping combat');
      return;
    }

    G.phase = 'combat';
    aiDeclareAllAttackers('ai');
    renderAll();
    await delay(500);

    const aiAttackers = getAttackers('ai');
    if (aiAttackers.length === 0) return;

    const playerHasBlockers = countAvailableBlockers('player') > 0;

    if (!playerHasBlockers) {
      for (const a of aiAttackers) a.inst._blockedBy = null;
      showModeBanner(`<div>⚠ AI ATTACKING — no blockers available</div>`);
      await delay(900);
      showModeBanner(`<div>💥 RESOLVING COMBAT</div>`);
      const events = resolveCombat('ai', 'player');
      await playCombatEvents(events);
    } else {
      _mode = 'combat-blockers';
      for (const { slotIdx: aSlotIdx, inst: aInst } of aiAttackers) {
        if (G.winner) break;
        _pendingBlockerForAttackerIdx = aSlotIdx;
        const aPow = aInst.power || 0;
        showModeBanner(`
          <div>🛡 BLOCK <strong>${aInst.name}</strong> (${aPow} power)?</div>
          <div style="font-size:11px; color:#fde047; margin-top:4px">Tap your creature to block</div>
          <button class="banner-cancel-btn" id="btn-go-face">⬇ GO TO FACE</button>
        `);
        const goFaceBtn = _container.querySelector('#btn-go-face');
        if (goFaceBtn) {
          goFaceBtn.addEventListener('click', () => {
            aInst._blockedBy = null;
            _pendingBlockerForAttackerIdx = null;
            if (_resumeBlockChoice) _resumeBlockChoice();
          });
        }
        renderAll();
        await new Promise(resolve => { _resumeBlockChoice = resolve; });
        _resumeBlockChoice = null;
      }
      _pendingBlockerForAttackerIdx = null;

      showModeBanner(`<div>💥 RESOLVING COMBAT</div>`);
      const events = resolveCombat('ai', 'player');
      await playCombatEvents(events);
    }

    await delay(400);
    showModeBanner(`<div>🩸 BLEED RESOLVES</div>`);
    const bleedEvents = resolvePostBattle();
    await playBleedEvents(bleedEvents);
    renderAll();

    checkWinCondition();
    G.phase = 'main';
    _mode = 'normal';
    hideModeBanner();
  } catch (err) {
    console.error('[combat] AI combat error', err);
    _mode = 'normal';
    G.phase = 'main';
    hideModeBanner();
    renderAll();
  }
}

async function playCombatEvents(events) {
  const fx = _container.querySelector('#combat-fx-layer');
  for (const e of events) {
    switch (e.type) {
      case 'face-damage':
        showFloatingNumber(fx, `-${e.damage} ❤`, '#f43f5e', e.defenderSide);
        logEvent(`${e.attackerName} hits ${e.defenderSide === 'player' ? 'you' : 'AI'} for ${e.damage}`);
        await delay(500);
        renderAll();
        break;
      case 'combat-attacker-wins':
        logEvent(`${e.attackerName} (${e.attackerPower}) destroys ${e.blockerName} (${e.blockerPower})`);
        await delay(400); renderAll();
        break;
      case 'combat-blocker-wins':
        logEvent(`${e.blockerName} (${e.blockerPower}) destroys ${e.attackerName} (${e.attackerPower})`);
        await delay(400); renderAll();
        break;
      case 'combat-tie':
        logEvent(`${e.attackerName} and ${e.blockerName} tie at ${e.power}`);
        await delay(300); renderAll();
        break;
      case 'selfbleed':
        logEvent(`${e.attackerName} selfbleeds ${e.amount}`);
        renderAll();
        break;
    }
  }
}

async function playBleedEvents(events) {
  const fx = _container.querySelector('#combat-fx-layer');
  for (const e of events) {
    showFloatingNumber(fx, `-${e.amount} ❤`, '#f43f5e', e.side);
    logEvent(`${e.side === 'player' ? 'You' : 'AI'} bleed for ${e.amount}`);
    await delay(500);
    renderAll();
  }
}

function showFloatingNumber(fx, text, color, side) {
  const n = document.createElement('div');
  n.style.cssText = `
    position: absolute;
    font-family: 'Cinzel Decorative', serif;
    font-weight: 700;
    font-size: 36px;
    text-shadow: 0 0 8px ${color}, 0 2px 4px rgba(0,0,0,0.95);
    transition: transform 0.9s cubic-bezier(.3,.1,.3,1.2), opacity 0.9s;
    pointer-events: none;
    z-index: 100;
    color: ${color};
    top: ${side === 'player' ? '70%' : '12%'};
    left: 40%;
  `;
  n.textContent = text;
  fx.appendChild(n);
  requestAnimationFrame(() => {
    n.style.transform = 'translateY(-40px) scale(1.2)';
    n.style.opacity = '0';
  });
  setTimeout(() => n.remove(), 900);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function onEndTurn() {
  if (_aiTurnRunning) return;
  if (G.activePlayer !== 'player') return;
  if (G.winner) { showStatus('Game over.'); return; }

  if (_mode === 'discard') {
    showStatus(`Discard ${G.player.hand.length - HAND_CAP} card(s) to continue`);
    return;
  }
  if (_mode === 'sacrifice-pick' || _mode === 'combat-attackers' || _mode === 'combat-blockers') {
    showStatus('Finish current action first');
    return;
  }

  closePreview();
  endTurn();
  renderAll();

  if (G.activePlayer === 'ai' && !G.winner) {
    _aiTurnRunning = true;
    const btn = _container.querySelector('#btn-end-turn');
    btn.style.opacity = '0.4';
    btn.style.pointerEvents = 'none';
    logEvent('— AI turn begins —');
    playGoldPulse('ai', G.ai.gold);

    try {
      await runAiTurn({
        onAction: (a) => {
          if (a.type === 'play') logEvent(`AI plays ${a.card.name}`);
          renderAll();
        },
      });
      await delay(300);
      if (!G.winner) {
        await runAiCombatPhase();
        await delay(300);
      }
      if (!G.winner && G.activePlayer === 'ai') {
        console.log('[turn] forcing endTurn — AI still active after runAiTurn');
        endTurn();
      }
    } catch (err) {
      console.error('[turn] AI turn error', err);
      if (G.activePlayer === 'ai') {
        try { endTurn(); } catch (e) {}
      }
    }

    _aiTurnRunning = false;
    btn.style.opacity = '';
    btn.style.pointerEvents = '';

    enforceHandCap();
    console.log('[turn] back to player. G.phase=', G.phase, 'G.activePlayer=', G.activePlayer);
    renderAll();

    if (!G.winner) {
      playGoldPulse('player', G.player.gold);
      logEvent(`— Your turn (T${G.turn}) —`);
    }
  }
  if (G.winner) showWinner();
}

function attachHandCardEvents(slotEl, inst) {
  let touchMoved = false;
  const onPointerDown = () => { touchMoved = false; };
  const onPointerMove = () => { touchMoved = true; };
  const onPointerUp = (e) => {
    if (touchMoved) return;
    e.preventDefault?.();
    e.stopPropagation?.();
    onHandCardTap(inst);
  };
  slotEl.addEventListener('touchstart', onPointerDown, { passive: true });
  slotEl.addEventListener('touchmove', onPointerMove, { passive: true });
  slotEl.addEventListener('touchend', onPointerUp, { passive: false });
  slotEl.addEventListener('mousedown', onPointerDown);
  slotEl.addEventListener('mouseup', onPointerUp);
}

function onHandCardTap(inst) {
  if (_mode === 'discard') {
    const result = discardFromHand('player', inst.instId);
    if (result.ok) {
      showStatus(`Discarded ${inst.name}`);
      enforceHandCap();
      renderAll();
    }
    return;
  }
  if (_mode !== 'normal') return;
  openPreview(inst);
}

function attachSlotEvents(slotEl) {
  slotEl.addEventListener('click', () => onSlotTap(slotEl));
}

function onSlotTap(slotEl) {
  const side = slotEl.dataset.side;
  const slotIdx = parseInt(slotEl.dataset.slotIdx, 10);

  if (_mode === 'sacrifice-pick' && side === 'player') {
    onSacrificeSlotPick(slotIdx);
    return;
  }
  if (_mode === 'combat-attackers' && side === 'player') {
    onAttackerSlotPick(slotIdx);
    return;
  }
  if (_mode === 'combat-blockers' && side === 'player') {
    onBlockerSlotPick(slotIdx);
    return;
  }
}

function onAttackerSlotPick(slotIdx) {
  const inst = G.player.creatures[slotIdx];
  if (!inst) return;
  if (inst._attacking) {
    undeclareAttacker('player', slotIdx);
  } else {
    const r = declareAttacker('player', slotIdx);
    if (!r.ok) {
      console.log('[combat] declareAttacker failed:', r.error, 'inst=', inst);
      showStatus(r.error);
      return;
    }
  }
  renderAll();
}

function onBlockerSlotPick(slotIdx) {
  if (_pendingBlockerForAttackerIdx === null) return;
  const aInst = G.ai.creatures[_pendingBlockerForAttackerIdx];
  if (!aInst) return;
  const r = assignBlocker('player', 'ai', _pendingBlockerForAttackerIdx, slotIdx);
  if (!r.ok) {
    showStatus(r.error);
    return;
  }
  _pendingBlockerForAttackerIdx = null;
  if (_resumeBlockChoice) _resumeBlockChoice();
}

function openPreview(inst) {
  _previewInst = inst;
  const overlay = _container.querySelector('#card-preview-overlay');
  overlay.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-wrapper';
  const card = createCardElement(inst, 'preview');
  wrapper.appendChild(card);

  const actions = document.createElement('div');
  actions.className = 'preview-actions';

  const isPlayerTurn = G.activePlayer === 'player' && (G.phase === 'main' || G.phase === 'renew');
  const affordable = canAffordInst(inst);
  const isCreature = inst.type !== 'Spell';
  const boardFull = isCreatureBoardFull('player');

  let canPlay = isPlayerTurn && affordable && isCreature;
  let needsSacrifice = canPlay && boardFull;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'preview-btn preview-btn-close';
  closeBtn.textContent = '✕ CLOSE';
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePreview(); });

  const playBtn = document.createElement('button');
  playBtn.className = 'preview-btn preview-btn-play' + (canPlay ? '' : ' disabled');
  if (!canPlay) {
    if (!isCreature) playBtn.textContent = 'SPELLS COMING SOON';
    else if (!isPlayerTurn) playBtn.textContent = 'NOT YOUR TURN';
    else playBtn.textContent = `NEED ${inst.goldCost}⛁ ${inst.bloodCost > 0 ? '+ ' + inst.bloodCost + '🩸' : ''}`;
  } else if (needsSacrifice) {
    playBtn.textContent = '🔁 SACRIFICE & PLAY';
    playBtn.addEventListener('click', (e) => { e.stopPropagation(); enterSacrificePickMode(inst); });
  } else {
    playBtn.textContent = `▶ PLAY (${inst.goldCost}⛁${inst.bloodCost > 0 ? ' ' + inst.bloodCost + '🩸' : ''})`;
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const result = playCardFromHand(inst);
      if (result.ok) {
        logEvent(`You play ${inst.name}`);
        closePreview();
        renderAll();
      } else {
        showStatus(result.error);
      }
    });
  }

  actions.appendChild(closeBtn);
  actions.appendChild(playBtn);
  wrapper.appendChild(actions);
  overlay.appendChild(wrapper);

  overlay.onclick = (e) => { if (e.target === overlay) closePreview(); };
  overlay.classList.remove('hidden');
}

function closePreview() {
  _previewInst = null;
  const overlay = _container.querySelector('#card-preview-overlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  setTimeout(() => { if (overlay.classList.contains('hidden')) overlay.innerHTML = ''; }, 300);
}

function enterSacrificePickMode(newInst) {
  _mode = 'sacrifice-pick';
  _pendingPlayInst = newInst;
  closePreview();
  showModeBanner(`
    <div>Tap a creature to SACRIFICE for <strong>${newInst.name}</strong></div>
    <button class="banner-cancel-btn" id="btn-cancel-sac">CANCEL</button>
  `);
  _container.querySelector('#btn-cancel-sac')?.addEventListener('click', exitSacrificePickMode);
  renderAll();
}

function exitSacrificePickMode() {
  _mode = 'normal';
  _pendingPlayInst = null;
  hideModeBanner();
  renderAll();
}

function onSacrificeSlotPick(slotIdx) {
  if (_mode !== 'sacrifice-pick' || !_pendingPlayInst) return;
  const newInst = _pendingPlayInst;
  const sacResult = sacrificeCreature('player', slotIdx);
  if (!sacResult.ok) {
    showStatus(sacResult.error || 'Sacrifice failed');
    exitSacrificePickMode();
    return;
  }
  const playResult = playCardFromHand(newInst);
  if (!playResult.ok) {
    showStatus(playResult.error || 'Play failed');
    exitSacrificePickMode();
    return;
  }
  logEvent(`You sacrificed ${sacResult.sacrificed.name} for ${newInst.name}`);
  exitSacrificePickMode();
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
function closeDock() { _container.querySelector('#dock-panel').classList.add('hidden'); }

function renderAll() {
  if (!_container || !G) return;
  renderTopBar();
  renderVitals();
  renderDeck();
  renderBoard('player');
  renderBoard('ai');
  renderHand();
  updateActionButtons();
}

function updateActionButtons() {
  const combatBtn = _container.querySelector('#btn-combat');
  const endBtn = _container.querySelector('#btn-end-turn');
  const confirmBtn = _container.querySelector('#btn-confirm');
  if (!combatBtn || !endBtn || !confirmBtn) return;

  const isMyTurn = G.activePlayer === 'player' && !G.winner;
  // LOOSENED: combat button shows during ANY phase that isn't combat-locked
  const inMain = isMyTurn && _mode === 'normal' && (G.phase === 'main' || G.phase === 'renew' || G.phase === undefined);
  const inCombatAttackers = _mode === 'combat-attackers';
  const hasAnyCreature = G.player.creatures.some(c => c !== null);

  // Show GO TO COMBAT during your turn whenever you have any creature
  combatBtn.style.display = (inMain && hasAnyCreature) ? 'flex' : 'none';

  confirmBtn.style.display = inCombatAttackers ? 'flex' : 'none';
  if (inCombatAttackers) {
    const declared = getAttackers('player').length;
    confirmBtn.innerHTML = declared > 0
      ? `<span>CONFIRM</span><span>ATTACK (${declared})</span>`
      : `<span>SKIP</span><span>COMBAT</span>`;
  }

  endBtn.style.display = (inCombatAttackers || _mode === 'combat-blockers') ? 'none' : 'flex';
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
    slotEl.classList.remove('attacking', 'attack-target', 'block-target', 'sacrifice-target', 'pending-attack-target');
    const host = slotEl.querySelector('.slot-card-host');
    host.innerHTML = '';
    const inst = slots[i];
    if (inst) {
      slotEl.classList.remove('empty');
      const cardEl = createCardElement(inst, 'battlefield');
      if (inst.exhausted) cardEl.classList.add('is-exhausted');
      if (inst.overexhausted) cardEl.classList.add('is-overexhausted');
      if (inst._attacking) slotEl.classList.add('attacking');
      host.appendChild(cardEl);
    } else {
      slotEl.classList.add('empty');
    }
  }

  if (_mode === 'sacrifice-pick' && side === 'player') {
    _container.querySelectorAll('.overlay-slots-pla .board-slot').forEach(s => {
      if (G.player.creatures[parseInt(s.dataset.slotIdx, 10)]) {
        s.classList.add('sacrifice-target');
      }
    });
  }
  if (_mode === 'combat-attackers' && side === 'player') {
    _container.querySelectorAll('.overlay-slots-pla .board-slot').forEach(s => {
      const idx = parseInt(s.dataset.slotIdx, 10);
      const c = G.player.creatures[idx];
      if (c && !c.exhausted && !c.overexhausted && (c.power || 0) > 0) {
        s.classList.add('attack-target');
      }
    });
  }
  if (_mode === 'combat-blockers') {
    if (side === 'player') {
      _container.querySelectorAll('.overlay-slots-pla .board-slot').forEach(s => {
        const idx = parseInt(s.dataset.slotIdx, 10);
        const c = G.player.creatures[idx];
        if (c && !c.exhausted && !c.overexhausted) {
          s.classList.add('block-target');
        }
      });
    }
    if (side === 'ai' && _pendingBlockerForAttackerIdx !== null) {
      const slotEl = _container.querySelector(`.overlay-slots-opp .board-slot[data-slot-idx="${_pendingBlockerForAttackerIdx}"]`);
      slotEl?.classList.add('pending-attack-target');
    }
  }

  if (side === 'player') {
    _container.querySelectorAll('.overlay-slots-pla .board-slot').forEach(s => {
      const clone = s.cloneNode(true);
      s.parentNode.replaceChild(clone, s);
      attachSlotEvents(clone);
    });
  }
}

function renderHand() {
  const fan = _container.querySelector('#hand-fan-overlay');
  if (!fan) return;
  fan.innerHTML = '';
  const hand = G.player.hand;
  const total = hand.length;
  if (total === 0) return;

  hand.forEach((inst, idx) => {
    const center = (total - 1) / 2;
    const offset = idx - center;
    const angleStep = total > 6 ? 4 : 6;
    const rotation = offset * angleStep;
    const lift = Math.abs(offset) * 0.5;

    const slot = document.createElement('div');
    slot.className = 'hand-slot';
    if (_mode === 'discard') slot.classList.add('discard-target');
    slot.dataset.fanRot = '1';
    slot.style.setProperty('--fan-rot', `${rotation}deg`);
    slot.style.setProperty('--fan-lift', `${lift}px`);
    slot.dataset.handIdx = idx;
    slot.dataset.instId = inst.instId;

    const card = createCardElement(inst, 'hand');
    const affordable = canAffordInst(inst) && G.activePlayer === 'player' && (G.phase === 'main' || G.phase === 'renew') && inst.type !== 'Spell';
    if (!affordable && _mode !== 'discard') card.classList.add('unaffordable');

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
  el.textContent = G.winner === 'player' ? '⚡ VICTORY ⚡' : (G.winner === 'ai' ? '💀 DEFEAT 💀' : '⚖ DRAW');
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

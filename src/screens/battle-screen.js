// ─────────────────────────────────────────────────────────────
// Battle Screen — Gesture Overhaul FIX 1
// Fixes:
//   1. Selected hand card visual is now INLINE (not dependent on CSS append)
//      — guaranteed to show: lift up 25%, scale 1.2x, gold border
//   2. Drag-to-play: removed strict zone check. Releasing anywhere outside
//      the hand area attempts a play. Console logging shows decision.
//   3. attemptPlayCard now logs its decision path
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
import {
  ensureRelicSlots, isRelicBoardFull, playRelicFromHand,
  sacrificeRelic, isRelicCard, aiTryPlayRelic,
} from '../game/relics.js';
import { attachCardGestures } from './card-interaction.js';

const HAND_CAP = 7;
const PLAYABLE_AS_CREATURE = ['Creature', 'creature'];
const SPELLS = ['Spell', 'spell'];
const RELICS_TYPES = ['Relic', 'relic', 'Permanent', 'permanent'];

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
let _sacrificeTargetType = 'creature';
let _selectedHandInstId = null;
let _draggedHandInstId = null;
let _draggedClone = null;

export function mountBattleScreen(container, opts = {}) {
  _container = container;
  ensureRelicSlots('player');
  ensureRelicSlots('ai');

  container.innerHTML = `
    <div id="battle-screen">
      <div class="battle-playfield">
        <div class="overlay-layer">
          ${renderTopBarOverlay()}
          ${renderVitalsOverlay('opponent')}
          ${renderDeckIndicator()}
          ${renderRelicsOverlay('opponent')}
          ${renderSlotsOverlay('opponent')}
          ${renderSlotsOverlay('player')}
          ${renderRelicsOverlay('player')}
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

function renderRelicsOverlay(side) {
  const sideClass = side === 'opponent' ? 'opp' : 'pla';
  const top = side === 'opponent' ? '12%' : '71.5%';
  return `
    <div class="overlay-relics overlay-relics-${sideClass}" style="position: absolute; top: ${top}; left: 42%; right: 13%; height: 6.5%; display: flex; justify-content: space-between; gap: 1.5%; z-index: 4;">
      ${[0, 1, 2, 3].map(i => `
        <div class="relic-slot" data-side="${who(side)}" data-relic-idx="${i}" style="flex: 1; aspect-ratio: 5/7; height: 100%; width: auto; position: relative; display: flex; align-items: center; justify-content: center;">
          <div class="relic-slot-host" style="width: 100%; height: 100%;"></div>
        </div>
      `).join('')}
    </div>
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
  return `<div class="overlay-deck"><span class="deck-count" data-bind="opponent.deck.length">x35</span></div>`;
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

function renderHandFan() { return `<div id="hand-fan-overlay"></div>`; }

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
  _container.querySelector('.battle-playfield')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('battle-playfield') || e.target.classList.contains('overlay-layer')) {
      _selectedHandInstId = null;
      renderAll();
    }
  });
}

function onGoToCombat() {
  if (G.activePlayer !== 'player') { showStatus('Not your turn'); return; }
  if (G.winner) return;
  if (_mode !== 'normal') { showStatus('Finish current action first'); return; }

  if (countAvailableAttackers('player') === 0) {
    showStatus('No creatures ready to attack');
    return;
  }

  _selectedHandInstId = null;
  _mode = 'combat-attackers';
  G.phase = 'combat';
  showModeBanner(`<div>⚔ COMBAT — tap your creatures to attack</div><div style="font-size:11px; color:#fde047; margin-top:4px">Then tap CONFIRM ATTACK</div>`);
  renderAll();
}

async function onConfirmAction() {
  if (_mode === 'combat-attackers') {
    const attackers = getAttackers('player');
    if (attackers.length === 0) { cancelCombat(); return; }
    await runPlayerCombatResolution();
  }
}

function cancelCombat() {
  for (const c of G.player.creatures) { if (c) delete c._attacking; }
  _mode = 'normal'; G.phase = 'main'; hideModeBanner(); renderAll();
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
    if (G.winner) { showWinner(); hideModeBanner(); return; }
    _mode = 'normal'; G.phase = 'main'; hideModeBanner(); renderAll();
  } catch (err) {
    console.error('[combat] error', err);
    _mode = 'normal'; G.phase = 'main'; hideModeBanner();
    showStatus('Combat error'); renderAll();
  }
}

async function runAiCombatPhase() {
  try {
    if (G.winner) return;
    if (countAvailableAttackers('ai') === 0) return;
    G.phase = 'combat';
    aiDeclareAllAttackers('ai');
    renderAll();
    await delay(500);

    const aiAttackers = getAttackers('ai');
    if (aiAttackers.length === 0) return;
    const playerHasBlockers = countAvailableBlockers('player') > 0;

    if (!playerHasBlockers) {
      for (const a of aiAttackers) a.inst._blockedBy = null;
      showModeBanner(`<div>⚠ AI ATTACKING — no blockers</div>`);
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
    G.phase = 'main'; _mode = 'normal'; hideModeBanner();
  } catch (err) {
    console.error('[combat] AI error', err);
    _mode = 'normal'; G.phase = 'main'; hideModeBanner(); renderAll();
  }
}

async function playCombatEvents(events) {
  const fx = _container.querySelector('#combat-fx-layer');
  for (const e of events) {
    switch (e.type) {
      case 'face-damage':
        showFloatingNumber(fx, `-${e.damage} ❤`, '#f43f5e', e.defenderSide);
        logEvent(`${e.attackerName} hits ${e.defenderSide === 'player' ? 'you' : 'AI'} for ${e.damage}`);
        await delay(500); renderAll(); break;
      case 'combat-attacker-wins':
        logEvent(`${e.attackerName} (${e.attackerPower}) destroys ${e.blockerName} (${e.blockerPower})`);
        await delay(400); renderAll(); break;
      case 'combat-blocker-wins':
        logEvent(`${e.blockerName} (${e.blockerPower}) destroys ${e.attackerName} (${e.attackerPower})`);
        await delay(400); renderAll(); break;
      case 'combat-tie':
        logEvent(`${e.attackerName} and ${e.blockerName} tie at ${e.power}`);
        await delay(300); renderAll(); break;
      case 'selfbleed':
        logEvent(`${e.attackerName} selfbleeds ${e.amount}`); renderAll(); break;
    }
  }
}

async function playBleedEvents(events) {
  const fx = _container.querySelector('#combat-fx-layer');
  for (const e of events) {
    showFloatingNumber(fx, `-${e.amount} ❤`, '#f43f5e', e.side);
    logEvent(`${e.side === 'player' ? 'You' : 'AI'} bleed for ${e.amount}`);
    await delay(500); renderAll();
  }
}

function showFloatingNumber(fx, text, color, side) {
  const n = document.createElement('div');
  n.style.cssText = `position:absolute; font-family:'Cinzel Decorative',serif; font-weight:700; font-size:36px; text-shadow:0 0 8px ${color}, 0 2px 4px rgba(0,0,0,0.95); transition:transform 0.9s cubic-bezier(.3,.1,.3,1.2), opacity 0.9s; pointer-events:none; z-index:100; color:${color}; top:${side === 'player' ? '70%' : '12%'}; left:40%;`;
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
    showStatus(`Discard ${G.player.hand.length - HAND_CAP} card(s) to continue`); return;
  }
  if (_mode === 'sacrifice-pick' || _mode === 'combat-attackers' || _mode === 'combat-blockers') {
    showStatus('Finish current action first'); return;
  }

  closePreview();
  _selectedHandInstId = null;
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
      let relicAttempts = 0;
      while (relicAttempts < 4) {
        const r = aiTryPlayRelic('ai');
        if (!r.ok) break;
        logEvent(`AI plays relic ${r.played.name}`);
        renderAll();
        await delay(300);
        relicAttempts++;
      }
      await delay(300);
      if (!G.winner) { await runAiCombatPhase(); await delay(300); }
      if (!G.winner && G.activePlayer === 'ai') endTurn();
    } catch (err) {
      console.error('[turn] AI error', err);
      if (G.activePlayer === 'ai') { try { endTurn(); } catch (e) {} }
    }

    _aiTurnRunning = false;
    btn.style.opacity = '';
    btn.style.pointerEvents = '';
    enforceHandCap();
    renderAll();
    if (!G.winner) { playGoldPulse('player', G.player.gold); logEvent(`— Your turn (T${G.turn}) —`); }
  }
  if (G.winner) showWinner();
}

// ═══════════════════════════════════════════════════════════
// HAND CARD GESTURES
// ═══════════════════════════════════════════════════════════

function attachHandCardGestures(slotEl, inst) {
  attachCardGestures(slotEl, {
    onTap: () => {
      console.log('[gesture] hand TAP', inst.name);
      if (_mode === 'discard') {
        const result = discardFromHand('player', inst.instId);
        if (result.ok) { showStatus(`Discarded ${inst.name}`); enforceHandCap(); renderAll(); }
        return;
      }
      if (_mode !== 'normal') return;

      if (_selectedHandInstId === inst.instId) {
        // Already selected — try to play
        attemptPlayCard(inst);
      } else {
        _selectedHandInstId = inst.instId;
        renderAll();
      }
    },
    onLongPress: () => {
      console.log('[gesture] hand LONG PRESS', inst.name);
      if (_mode === 'discard' || _mode === 'sacrifice-pick') return;
      openPreview(inst, 'hand');
    },
    onDragStart: () => {
      console.log('[gesture] hand DRAG START', inst.name);
      if (_mode !== 'normal') return;
      if (G.activePlayer !== 'player') return;
      closePreview();
      _draggedHandInstId = inst.instId;

      const rect = slotEl.getBoundingClientRect();
      _draggedClone = slotEl.cloneNode(true);
      _draggedClone.style.position = 'fixed';
      _draggedClone.style.left = rect.left + 'px';
      _draggedClone.style.top = rect.top + 'px';
      _draggedClone.style.width = rect.width + 'px';
      _draggedClone.style.height = rect.height + 'px';
      _draggedClone.style.transform = 'rotate(0deg) scale(1.15)';
      _draggedClone.style.zIndex = '8500';
      _draggedClone.style.pointerEvents = 'none';
      _draggedClone.style.transition = 'none';
      _draggedClone.style.opacity = '0.95';
      _draggedClone.style.filter = 'drop-shadow(0 8px 20px rgba(234, 179, 8, 0.8))';
      document.body.appendChild(_draggedClone);
      slotEl.style.opacity = '0.3';
    },
    onDragMove: (x, y) => {
      if (!_draggedClone) return;
      const rect = _draggedClone.getBoundingClientRect();
      _draggedClone.style.left = (x - rect.width / 2) + 'px';
      _draggedClone.style.top = (y - rect.height / 2) + 'px';
    },
    onDragEnd: (x, y) => {
      console.log('[gesture] hand DRAG END at', x, y);
      if (_draggedClone) { _draggedClone.remove(); _draggedClone = null; }
      slotEl.style.opacity = '';

      // Determine if drop is in play area
      const playfield = _container.querySelector('.battle-playfield');
      const pfRect = playfield.getBoundingClientRect();
      const relY = (y - pfRect.top) / pfRect.height;
      console.log('[gesture] drop relY=', relY.toFixed(2), '(< 0.78 plays)');

      // Strict check removed — try to play whenever dragged outside hand
      // Use 0.85 threshold so even slight upward drag plays the card
      if (relY < 0.85) {
        attemptPlayCard(inst);
      } else {
        console.log('[gesture] drop in hand area, no play');
      }
      _draggedHandInstId = null;
    },
  });
}

function attemptPlayCard(inst) {
  console.log('[play] attempt', inst.name, 'type=', inst.type);
  if (G.activePlayer !== 'player') {
    console.log('[play] FAIL: not your turn');
    showStatus('Not your turn');
    return;
  }
  const cardType = inst.type || 'Unknown';
  const isCreature = PLAYABLE_AS_CREATURE.includes(cardType);
  const isSpell = SPELLS.includes(cardType);
  const isRelic = RELICS_TYPES.includes(cardType);

  if (isSpell) {
    console.log('[play] FAIL: spells coming soon');
    showStatus('Spells coming soon');
    return;
  }
  if (!isCreature && !isRelic) {
    console.log('[play] FAIL: unsupported type', cardType);
    showStatus(`${cardType} not yet supported`);
    return;
  }

  if (isRelic) {
    const goldCost = inst.goldCost || 0;
    const bloodCost = inst.bloodCost || 0;
    if ((G.player.gold || 0) < goldCost) {
      console.log('[play] FAIL: need', goldCost, 'gold');
      showStatus(`Need ${goldCost} gold`);
      return;
    }
    if ((G.player.blood || 0) <= bloodCost) {
      console.log('[play] FAIL: cannot pay blood');
      showStatus(`Cannot pay ${bloodCost} blood`);
      return;
    }
    if (isRelicBoardFull('player')) {
      console.log('[play] relic board full → sacrifice mode');
      enterSacrificePickMode(inst, 'relic');
      return;
    }
    const result = playRelicFromHand('player', inst.instId);
    console.log('[play] playRelicFromHand result:', result);
    if (result.ok) {
      logEvent(`You play relic ${inst.name}`);
      _selectedHandInstId = null;
      closePreview();
      renderAll();
    } else {
      showStatus(result.error);
    }
    return;
  }

  // Creature path
  const aff = canAffordInst(inst);
  console.log('[play] creature canAfford:', aff, 'gold=', G.player.gold, 'blood=', G.player.blood);
  if (!aff) {
    showStatus(`Need ${inst.goldCost}⛁ ${inst.bloodCost > 0 ? '+ ' + inst.bloodCost + '🩸' : ''}`);
    return;
  }
  if (isCreatureBoardFull('player')) {
    console.log('[play] creature board full → sacrifice mode');
    enterSacrificePickMode(inst, 'creature');
    return;
  }
  const result = playCardFromHand(inst);
  console.log('[play] playCardFromHand result:', result);
  if (result.ok) {
    logEvent(`You play ${inst.name}`);
    _selectedHandInstId = null;
    closePreview();
    renderAll();
  } else {
    showStatus(result.error);
  }
}

// ═══════════════════════════════════════════════════════════
// BATTLEFIELD GESTURES
// ═══════════════════════════════════════════════════════════

function attachBattlefieldGestures(slotEl, inst, kind) {
  attachCardGestures(slotEl, {
    enableDoubleTap: true,
    onTap: () => {
      const side = slotEl.dataset.side;
      const slotIdx = parseInt(slotEl.dataset.slotIdx ?? slotEl.dataset.relicIdx, 10);
      if (_mode === 'sacrifice-pick' && side === 'player') {
        if (kind === 'creature' && _sacrificeTargetType === 'creature') onSacrificeSlotPick(slotIdx);
        else if (kind === 'relic' && _sacrificeTargetType === 'relic') onSacrificeRelicPick(slotIdx);
        return;
      }
      if (_mode === 'combat-attackers' && side === 'player' && kind === 'creature') {
        onAttackerSlotPick(slotIdx);
        return;
      }
      if (_mode === 'combat-blockers' && side === 'player' && kind === 'creature') {
        onBlockerSlotPick(slotIdx);
        return;
      }
    },
    onDoubleTap: () => {
      const side = slotEl.dataset.side;
      const slotIdx = parseInt(slotEl.dataset.slotIdx ?? slotEl.dataset.relicIdx, 10);
      if (side !== 'player') return;
      if (_mode !== 'normal') return;
      activateAbility(inst, kind, slotIdx);
    },
    onLongPress: () => {
      openPreview(inst, 'battlefield');
    },
  });
}

function activateAbility(inst, kind, slotIdx) {
  showStatus(`${inst.name}'s ability — coming soon`);
  logEvent(`Tried to activate ${inst.name}'s ability`);
  console.log('[ability] activate:', inst.name, 'kind=', kind, 'slot=', slotIdx);
}

function onAttackerSlotPick(slotIdx) {
  const inst = G.player.creatures[slotIdx];
  if (!inst) return;
  if (inst._attacking) {
    undeclareAttacker('player', slotIdx);
  } else {
    const r = declareAttacker('player', slotIdx);
    if (!r.ok) { showStatus(r.error); return; }
  }
  renderAll();
}

function onBlockerSlotPick(slotIdx) {
  if (_pendingBlockerForAttackerIdx === null) return;
  const aInst = G.ai.creatures[_pendingBlockerForAttackerIdx];
  if (!aInst) return;
  const r = assignBlocker('player', 'ai', _pendingBlockerForAttackerIdx, slotIdx);
  if (!r.ok) { showStatus(r.error); return; }
  _pendingBlockerForAttackerIdx = null;
  if (_resumeBlockChoice) _resumeBlockChoice();
}

function openPreview(inst, source = 'hand') {
  _previewInst = inst;
  const overlay = _container.querySelector('#card-preview-overlay');
  overlay.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-wrapper';
  const card = createCardElement(inst, 'preview');
  wrapper.appendChild(card);

  const actions = document.createElement('div');
  actions.className = 'preview-actions';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'preview-btn preview-btn-close';
  closeBtn.textContent = '✕ CLOSE';
  closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closePreview(); });
  actions.appendChild(closeBtn);

  if (source === 'hand') {
    const playBtn = document.createElement('button');
    playBtn.className = 'preview-btn preview-btn-play';
    playBtn.textContent = '▶ PLAY';
    playBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closePreview();
      attemptPlayCard(inst);
    });
    actions.appendChild(playBtn);
  }

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

function enterSacrificePickMode(newInst, targetType) {
  _mode = 'sacrifice-pick';
  _pendingPlayInst = newInst;
  _sacrificeTargetType = targetType;
  _selectedHandInstId = null;
  closePreview();
  const what = targetType === 'relic' ? 'relic' : 'creature';
  showModeBanner(`
    <div>Tap a ${what} to SACRIFICE for <strong>${newInst.name}</strong></div>
    <button class="banner-cancel-btn" id="btn-cancel-sac">CANCEL</button>
  `);
  _container.querySelector('#btn-cancel-sac')?.addEventListener('click', exitSacrificePickMode);
  renderAll();
}

function exitSacrificePickMode() {
  _mode = 'normal';
  _pendingPlayInst = null;
  _sacrificeTargetType = 'creature';
  hideModeBanner();
  renderAll();
}

function onSacrificeSlotPick(slotIdx) {
  if (_mode !== 'sacrifice-pick' || !_pendingPlayInst) return;
  if (_sacrificeTargetType !== 'creature') return;
  const newInst = _pendingPlayInst;
  const sacResult = sacrificeCreature('player', slotIdx);
  if (!sacResult.ok) { showStatus(sacResult.error); exitSacrificePickMode(); return; }
  const playResult = playCardFromHand(newInst);
  if (!playResult.ok) { showStatus(playResult.error); exitSacrificePickMode(); return; }
  logEvent(`You sacrificed ${sacResult.sacrificed.name} for ${newInst.name}`);
  exitSacrificePickMode();
}

function onSacrificeRelicPick(relicIdx) {
  if (_mode !== 'sacrifice-pick' || !_pendingPlayInst) return;
  if (_sacrificeTargetType !== 'relic') return;
  const newInst = _pendingPlayInst;
  const sacResult = sacrificeRelic('player', relicIdx);
  if (!sacResult.ok) { showStatus(sacResult.error); exitSacrificePickMode(); return; }
  const playResult = playRelicFromHand('player', newInst.instId);
  if (!playResult.ok) { showStatus(playResult.error); exitSacrificePickMode(); return; }
  logEvent(`You sacrificed relic ${sacResult.sacrificed.name} for ${newInst.name}`);
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
  renderRelics('player');
  renderRelics('ai');
  renderHand();
  updateActionButtons();
}

function updateActionButtons() {
  const combatBtn = _container.querySelector('#btn-combat');
  const endBtn = _container.querySelector('#btn-end-turn');
  const confirmBtn = _container.querySelector('#btn-confirm');
  if (!combatBtn || !endBtn || !confirmBtn) return;

  const isMyTurn = G.activePlayer === 'player' && !G.winner;
  const inCombatAttackers = _mode === 'combat-attackers';
  const hasAnyCreature = G.player.creatures.some(c => c !== null);
  const isNormal = _mode === 'normal';

  combatBtn.style.display = (isMyTurn && isNormal && hasAnyCreature) ? 'flex' : 'none';
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

  if (_mode === 'sacrifice-pick' && side === 'player' && _sacrificeTargetType === 'creature') {
    _container.querySelectorAll('.overlay-slots-pla .board-slot').forEach(s => {
      if (G.player.creatures[parseInt(s.dataset.slotIdx, 10)]) s.classList.add('sacrifice-target');
    });
  }
  if (_mode === 'combat-attackers' && side === 'player') {
    _container.querySelectorAll('.overlay-slots-pla .board-slot').forEach(s => {
      const idx = parseInt(s.dataset.slotIdx, 10);
      const c = G.player.creatures[idx];
      if (c && !c.exhausted && !c.overexhausted && (c.power || 0) > 0) s.classList.add('attack-target');
    });
  }
  if (_mode === 'combat-blockers') {
    if (side === 'player') {
      _container.querySelectorAll('.overlay-slots-pla .board-slot').forEach(s => {
        const idx = parseInt(s.dataset.slotIdx, 10);
        const c = G.player.creatures[idx];
        if (c && !c.exhausted && !c.overexhausted) s.classList.add('block-target');
      });
    }
    if (side === 'ai' && _pendingBlockerForAttackerIdx !== null) {
      const slotEl = _container.querySelector(`.overlay-slots-opp .board-slot[data-slot-idx="${_pendingBlockerForAttackerIdx}"]`);
      slotEl?.classList.add('pending-attack-target');
    }
  }

  _container.querySelectorAll(`.overlay-slots-${sideClass} .board-slot`).forEach(s => {
    const clone = s.cloneNode(true);
    s.parentNode.replaceChild(clone, s);
    const idx = parseInt(clone.dataset.slotIdx, 10);
    const inst = G[side].creatures[idx];
    if (inst) attachBattlefieldGestures(clone, inst, 'creature');
  });
}

function renderRelics(side) {
  ensureRelicSlots(side);
  const sideClass = side === 'ai' ? 'opp' : 'pla';
  const relics = G[side].relics;
  for (let i = 0; i < 4; i++) {
    const slotEl = _container.querySelector(`.overlay-relics-${sideClass} .relic-slot[data-relic-idx="${i}"]`);
    if (!slotEl) continue;
    slotEl.classList.remove('sacrifice-target');
    const host = slotEl.querySelector('.relic-slot-host');
    host.innerHTML = '';
    const inst = relics[i];
    if (inst) {
      slotEl.classList.remove('empty');
      const cardEl = createCardElement(inst, 'battlefield');
      cardEl.style.width = '100%';
      cardEl.style.height = '100%';
      host.appendChild(cardEl);
    } else {
      slotEl.classList.add('empty');
    }
  }

  if (_mode === 'sacrifice-pick' && side === 'player' && _sacrificeTargetType === 'relic') {
    _container.querySelectorAll('.overlay-relics-pla .relic-slot').forEach(s => {
      if (G.player.relics[parseInt(s.dataset.relicIdx, 10)]) s.classList.add('sacrifice-target');
    });
  }

  _container.querySelectorAll(`.overlay-relics-${sideClass} .relic-slot`).forEach(s => {
    const clone = s.cloneNode(true);
    s.parentNode.replaceChild(clone, s);
    const idx = parseInt(clone.dataset.relicIdx, 10);
    const inst = G[side].relics[idx];
    if (inst) attachBattlefieldGestures(clone, inst, 'relic');
  });
}

// ═══════════════════════════════════════════════════════════
// renderHand — Selected card visual is INLINE so it always shows
// ═══════════════════════════════════════════════════════════

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
    const isSelected = _selectedHandInstId === inst.instId;

    const slot = document.createElement('div');
    slot.className = 'hand-slot';
    if (_mode === 'discard') slot.classList.add('discard-target');
    slot.dataset.fanRot = '1';
    slot.dataset.handIdx = idx;
    slot.dataset.instId = inst.instId;

    if (isSelected) {
      // INLINE selected styling — guaranteed to show
      slot.style.setProperty('--fan-rot', `0deg`);
      slot.style.setProperty('--fan-lift', `0px`);
      slot.style.transform = 'translateY(-60%) scale(1.3)';
      slot.style.zIndex = '50';
      slot.style.transition = 'transform 0.25s cubic-bezier(.3,.1,.3,1.4)';
    } else {
      slot.style.setProperty('--fan-rot', `${rotation}deg`);
      slot.style.setProperty('--fan-lift', `${lift}px`);
    }

    const card = createCardElement(inst, 'hand');
    const isRelic = isRelicCard(inst);
    let affordable;
    if (isRelic) {
      affordable = (G.player.gold || 0) >= (inst.goldCost || 0)
        && (G.player.blood || 0) > (inst.bloodCost || 0)
        && G.activePlayer === 'player';
    } else {
      affordable = canAffordInst(inst) && G.activePlayer === 'player' && inst.type !== 'Spell';
    }
    if (!affordable && _mode !== 'discard') card.classList.add('unaffordable');

    if (isSelected) {
      // INLINE gold-glow border on selected card
      card.style.border = '3px solid #fde047';
      card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.95), 0 0 32px rgba(234, 179, 8, 0.85), inset 0 0 22px rgba(234, 179, 8, 0.2)';
    }

    attachHandCardGestures(slot, inst);
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

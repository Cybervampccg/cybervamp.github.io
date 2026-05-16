// ─────────────────────────────────────────────────────────────
// Battle Screen — Spells & Abilities session
// Adds:
//   - Spell playing: drag spell from hand → enters target-pick mode →
//     valid targets highlighted → tap a target → effect resolves
//   - Activated abilities: double-tap own creature/relic → if it has an
//     ability → enters target-pick mode → tap target → effect resolves
//   - Banner indicates current target requirement
//   - Cancel button cancels target picking and refunds the action
// ─────────────────────────────────────────────────────────────

import '../styles/effects.css';
import { G } from '../game/state.js';
import '../game/triggers.js'; // installs ON_DEATH and other trigger hooks
import { beginTurn, endTurn, playCardFromHand, canAffordInst } from '../game/flow.js';
import { sfx, bgmFadeIn, bgmPause, toggleMute, preloadAudio } from '../game/audio.js';
import {
  injectOverlays, removeOverlays,
  showPhaseTransition, showTurnBanner, showDamageVignette,
  floatNumberAtElement, cardArrive, cardDrawEnter, screenShake,
  hapticTap, hapticAct, hapticDamage, hapticWin,
  showHeroMoment, showEndgame,
  createMuteButton, removeMuteButton,
} from '../game/vfx.js';
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
import { canPlaySpell, getSpellTargetRequirements, playSpellFromHand } from '../game/spells.js';
import { canActivateAbility, getAbilityTargetRequirements, activateAbility } from '../game/abilities.js';
import { getValidTargets } from '../game/effects.js';
import { hasActivatedAbility, isSpellSupported } from '../game/card-effects.js';
import { aiCastSpells, aiActivateAbilities } from '../game/ai-spells.js';

const HAND_CAP = 7;
const PLAYABLE_AS_CREATURE = ['Creature', 'creature'];
const SPELLS = ['Spell', 'spell'];
const RELICS_TYPES = ['Relic', 'relic', 'Permanent', 'permanent'];

const ACTION_BTN_BASE_STYLE = `
  position: absolute; top: 92.5%; width: 16%; height: 6.2%;
  font-family: 'Cinzel Decorative', serif; font-weight: 700; font-size: 11px;
  letter-spacing: 1px; border: 1px solid rgba(255, 200, 200, 0.4);
  clip-path: polygon(15% 0%, 85% 0%, 100% 50%, 85% 100%, 15% 100%, 0% 50%);
  cursor: pointer; display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  text-shadow: 0 1px 3px rgba(0,0,0,0.9); z-index: 7; line-height: 1.1;
`;

let _container = null;
let _aiTurnRunning = false;
let _mode = 'normal';
let _pendingPlayInst = null;
let _pendingBlockerForAttackerIdx = null;
let _resumeBlockChoice = null;
let _sacrificeTargetType = 'creature';
let _selectedHandInstId = null;
let _draggedHandInstId = null;
let _draggedClone = null;
let _prevHandInstIds = new Set();

// Target-pick mode state
let _pickContext = null;

// ─── Renewal helper ───
// At the start of each side's turn, their permanents step toward renewed:
//   Overexhausted (180°) → Exhausted (90°)
//   Exhausted (90°)       → Renewed (upright)
//   Renewed                → no change
// Also clears end-of-turn temp buffs and once-per-turn ability flags.
function renewPermanents(side) {
  const permanents = [
    ...(G[side]?.creatures || []),
    ...(G[side]?.relics || []),
  ];
  for (const p of permanents) {
    if (!p) continue;
    if (p.overexhausted) {
      // Step down one notch: overexhausted → exhausted
      delete p.overexhausted;
      p.exhausted = true;
    } else if (p.exhausted) {
      // Fully renewed
      delete p.exhausted;
    }
    // Clear end-of-turn temp buffs from THIS side's previous turn
    if (p._tempPowerBonus && p._tempBonusExpiresAt === 'endOfTurn') {
      p.power = (p.power || 0) - p._tempPowerBonus;
      delete p._tempPowerBonus;
      delete p._tempBonusExpiresAt;
    }
    // Clear once-per-turn ability flags
    delete p._abilityUsedThisTurn;
    // Clear damage tracking (creatures heal between turns in this design)
    delete p._damageTaken;
    // Clear end-of-turn granted keywords (per RULES §5 / keyword-patch)
    if (Array.isArray(p._grantedKeywords)) {
      p._grantedKeywords = p._grantedKeywords.filter(g => g.duration === 'permanent');
      if (p._grantedKeywords.length === 0) delete p._grantedKeywords;
    }
    // Clear bleed modifiers (Blade Silhouette multiplier, Bleed +1 bonus)
    delete p._bleedBonus;
    delete p._bleedMultiplier;
    // Clear newly-turned flag (this side's permanents from previous turn are no longer summoning-sick)
    p.newlyTurned = false;
    // Clear wall-decay tracking flag from previous turn
    delete p._blockedThisTurn;
  }
}
// shape: {
//   kind: 'spell' | 'ability',
//   inst, side, slotIdx?, ability?,
//   targetReqs: [{type, label, optional, filter}, ...],
//   collected: [],
//   currentIdx: 0,
// }

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

  preloadAudio();
  injectOverlays();
  bgmFadeIn(3000);
  createMuteButton(toggleMute);

  wireEvents();
  beginTurn('player');
  renewPermanents('player'); // turn 1 has no exhausted cards but safe to call
  enforceHandCap();
  renderAll();
  playGoldPulse('player', G.player.gold);
  showTurnBanner('YOUR TURN', 'player');
}

function renderActionButtons() {
  const endTurnStyle = ACTION_BTN_BASE_STYLE +
    `right: 1.5%; background: linear-gradient(180deg, rgba(185, 28, 44, 0.8) 0%, rgba(110, 13, 24, 0.9) 100%); color: #fde047;`;
  const combatStyle = ACTION_BTN_BASE_STYLE +
    `right: 18%; background: linear-gradient(180deg, #c2410c 0%, #7c2d12 100%); color: #ffedd5; border-color: rgba(255, 180, 100, 0.6);`;
  const confirmStyle = ACTION_BTN_BASE_STYLE +
    `right: 1.5%; background: linear-gradient(180deg, #b45309 0%, #78350f 100%); color: #fde047; border-color: rgba(253, 224, 71, 0.7);`;

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
    <div class="overlay-relics overlay-relics-${sideClass}" style="position: absolute; top: ${top}; left: 42%; right: 13%; height: 6.5%; display: flex; justify-content: flex-end; gap: 1.5%; z-index: 4;">
      ${[3, 2, 1, 0].map(i => `
        <div class="relic-slot" data-side="${who(side)}" data-relic-idx="${i}" style="aspect-ratio: 5/7; height: 100%; width: auto; position: relative; display: flex; align-items: center; justify-content: center;">
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
        <span class="vital-stat"><span class="vital-icon">❤</span><span class="vital-num" data-bind="${who(side)}.blood">30</span></span>
        <span class="vital-stat"><span class="vital-icon">🩸</span><span class="vital-num" data-bind="${who(side)}.bleedPool">0</span></span>
        <span class="vital-stat gold-stat ${side === 'opponent' ? 'dim' : ''}" data-vital="gold" data-side="${who(side)}">
          <span class="vital-icon">⛁</span><span class="vital-num" data-bind="${who(side)}.gold">0/0</span>
        </span>
      </div>
    </div>
  `;
}

function renderDeckIndicator() {
  // Opponent deck + discard, stacked side-by-side, right of opp slot 4
  // Player deck + discard, stacked side-by-side, right of player slot 4
  return `
    <div class="overlay-deckpile overlay-deckpile-opp" style="position:absolute; top:23.5%; right:1.5%; width:11%; height:14.5%; display:flex; gap:4px; z-index:5;">
      <div class="pile pile-deck" data-side="ai" data-pile="deck" style="flex:1; background:rgba(20,20,30,0.85); border:1px solid rgba(192, 132, 252, 0.4); border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:default;">
        <div style="font-size:10px; color:#a78bfa; letter-spacing:0.5px;">DECK</div>
        <div style="font-size:14px; color:#fff; font-weight:700;" data-bind="ai.deck.length">0</div>
      </div>
      <div class="pile pile-discard" data-side="ai" data-pile="discard" style="flex:1; background:rgba(20,20,30,0.85); border:1px solid rgba(244, 63, 94, 0.4); border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer;">
        <div style="font-size:10px; color:#fca5a5; letter-spacing:0.5px;">DISC</div>
        <div style="font-size:14px; color:#fff; font-weight:700;" data-bind="ai.discard.length">0</div>
      </div>
    </div>

    <div class="overlay-deckpile overlay-deckpile-pla" style="position:absolute; top:55%; right:1.5%; width:11%; height:14%; display:flex; gap:4px; z-index:5;">
      <div class="pile pile-deck" data-side="player" data-pile="deck" style="flex:1; background:rgba(20,20,30,0.85); border:1px solid rgba(192, 132, 252, 0.4); border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:default;">
        <div style="font-size:10px; color:#a78bfa; letter-spacing:0.5px;">DECK</div>
        <div style="font-size:14px; color:#fff; font-weight:700;" data-bind="player.deck.length">0</div>
      </div>
      <div class="pile pile-discard" data-side="player" data-pile="discard" style="flex:1; background:rgba(20,20,30,0.85); border:1px solid rgba(244, 63, 94, 0.4); border-radius:4px; display:flex; flex-direction:column; align-items:center; justify-content:center; cursor:pointer;">
        <div style="font-size:10px; color:#fca5a5; letter-spacing:0.5px;">DISC</div>
        <div style="font-size:14px; color:#fff; font-weight:700;" data-bind="player.discard.length">0</div>
      </div>
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

function renderHandFan() { return `<div id="hand-fan-overlay"></div>`; }

function renderSideDock() {
  // Top-right corner, horizontal row of three small buttons
  // Positioned LEFT of the existing home button (which sits at top-right corner)
  return `
    <div id="top-right-dock" style="
      position: absolute;
      top: 1.5%;
      right: 9%;
      display: flex;
      gap: 6px;
      z-index: 7;
    ">
      <button class="dock-btn dock-btn-top" data-dock="mission" title="Mission" style="
        width: 32px; height: 32px;
        background: rgba(20, 20, 30, 0.85);
        border: 1px solid rgba(192, 132, 252, 0.4);
        border-radius: 6px;
        color: #e9d5ff;
        font-size: 16px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
      ">📋</button>
      <button class="dock-btn dock-btn-top" data-dock="log" title="Battle Log" style="
        width: 32px; height: 32px;
        background: rgba(20, 20, 30, 0.85);
        border: 1px solid rgba(192, 132, 252, 0.4);
        border-radius: 6px;
        color: #e9d5ff;
        font-size: 16px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
      ">📜</button>
      <button class="dock-btn dock-btn-top" data-dock="settings" title="Settings" style="
        width: 32px; height: 32px;
        background: rgba(20, 20, 30, 0.85);
        border: 1px solid rgba(192, 132, 252, 0.4);
        border-radius: 6px;
        color: #e9d5ff;
        font-size: 16px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        backdrop-filter: blur(4px);
      ">⚙</button>
    </div>
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
    removeOverlays();
    removeMuteButton();
    bgmPause();
    import('./home-screen.js').then(m => m.mountHomeScreen?.(document.getElementById('app')));
  });
  _container.querySelector('#btn-end-turn').addEventListener('click', onEndTurn);
  _container.querySelector('#btn-combat').addEventListener('click', onGoToCombat);
  _container.querySelector('#btn-confirm').addEventListener('click', onConfirmAction);
  _container.querySelectorAll('[data-dock]').forEach(btn => {
    btn.addEventListener('click', () => openDock(btn.dataset.dock));
  });
  _container.querySelector('[data-action="close-dock"]')?.addEventListener('click', closeDock);
  // Discard pile click handlers
  _container.querySelectorAll('[data-pile="discard"]').forEach(p => {
    p.addEventListener('click', () => {
      const side = p.dataset.side;
      openDiscardViewer(side);
    });
  });
  _container.querySelector('.battle-playfield')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('battle-playfield') || e.target.classList.contains('overlay-layer')) {
      _selectedHandInstId = null;
      renderAll();
    }
  });
}

// ═══════════════════════════════════════════════════════════
// COMBAT
// ═══════════════════════════════════════════════════════════

function onGoToCombat() {
  if (G.activePlayer !== 'player') { showStatus('Not your turn'); return; }
  if (G.winner) return;
  if (_mode !== 'normal') { showStatus('Finish current action first'); return; }

  if (countAvailableAttackers('player') === 0) {
    showStatus('No creatures ready to attack'); return;
  }

  _selectedHandInstId = null;
  _mode = 'combat-attackers';
  G.phase = 'combat';
  sfx('phase_change', 0.6);
  showPhaseTransition('combat');
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
        sfx('damage');
        showFloatingNumber(fx, `-${e.damage} ❤`, '#f43f5e', e.defenderSide);
        if (e.defenderSide === 'player') { showDamageVignette(); screenShake(); hapticDamage(); }
        logEvent(`${e.attackerName} hits ${e.defenderSide === 'player' ? 'you' : 'AI'} for ${e.damage}`);
        await delay(500); renderAll(); break;
      case 'combat-attacker-wins':
        sfx('destroy');
        logEvent(`${e.attackerName} (${e.attackerPower}) destroys ${e.blockerName} (${e.blockerPower})`);
        await delay(400); renderAll(); break;
      case 'combat-blocker-wins':
        sfx('destroy');
        logEvent(`${e.blockerName} (${e.blockerPower}) destroys ${e.attackerName} (${e.attackerPower})`);
        await delay(400); renderAll(); break;
      case 'combat-tie':
        sfx('destroy');
        logEvent(`${e.attackerName} and ${e.blockerName} tie at ${e.power}`);
        await delay(300); renderAll(); break;
      case 'selfbleed':
        sfx('bleed', 0.5);
        logEvent(`${e.attackerName} selfbleeds ${e.amount}`); renderAll(); break;
    }
  }
}

async function playBleedEvents(events) {
  const fx = _container.querySelector('#combat-fx-layer');
  for (const e of events) {
    sfx('bleed');
    showFloatingNumber(fx, `-${e.amount} ❤`, '#f43f5e', e.side);
    if (e.side === 'player') { showDamageVignette(); hapticDamage(); }
    logEvent(`${e.side === 'player' ? 'You' : 'AI'} bleed for ${e.amount}`);
    await delay(500); renderAll();
  }
}

// ═══════════════════════════════════════════════════════════
// SPELL / ABILITY EVENT REPLAY
// ═══════════════════════════════════════════════════════════

async function playSpellEvents(events) {
  const fx = _container.querySelector('#combat-fx-layer');
  for (const e of events) {
    switch (e.type) {
      case 'face-damage':
        showFloatingNumber(fx, `-${e.damage} ❤`, '#f43f5e', e.defenderSide);
        logEvent(`${e.attackerName} → ${e.defenderSide} for ${e.damage}`);
        await delay(300); break;
      case 'creature-damage':
        showFloatingNumber(fx, `-${e.amount}`, '#f43f5e', e.side);
        logEvent(`${e.name} takes ${e.amount}`);
        await delay(300); break;
      case 'creature-destroyed':
        logEvent(`${e.name} destroyed`); await delay(200); break;
      case 'relic-destroyed':
        logEvent(`Relic ${e.name} destroyed`); await delay(200); break;
      case 'heal':
        showFloatingNumber(fx, `+${e.amount} ❤`, '#22c55e', e.side);
        logEvent(`${e.side === 'player' ? 'You' : 'AI'} healed ${e.amount}`);
        await delay(300); break;
      case 'buff':
        showFloatingNumber(fx, `+${e.power} ⚔`, '#fde047', e.side);
        logEvent(`${e.name} +${e.power} power`); await delay(200); break;
      case 'exhaust': logEvent(`${e.name} exhausted`); await delay(200); break;
      case 'overexhaust': logEvent(`${e.name} overexhausted`); await delay(200); break;
      case 'renew': logEvent(`${e.name} renewed`); await delay(200); break;
      case 'draw':
        showFloatingNumber(fx, `+${e.amount} 🂠`, '#60a5fa', e.side);
        logEvent(`${e.side === 'player' ? 'You' : 'AI'} drew ${e.amount}`);
        await delay(300); break;
      case 'discard': logEvent(`${e.side === 'player' ? 'You' : 'AI'} discarded ${e.amount}`); await delay(200); break;
      case 'bleed-add':
        showFloatingNumber(fx, `+${e.amount} 🩸`, '#dc2626', e.side);
        logEvent(`${e.side === 'player' ? 'You' : 'AI'} +${e.amount} bleed`);
        await delay(300); break;
      case 'bleed-remove':
        showFloatingNumber(fx, `-${e.amount} 🩸`, '#22c55e', e.side);
        logEvent(`${e.side === 'player' ? 'You' : 'AI'} -${e.amount} bleed`);
        await delay(300); break;
      case 'return-to-hand': logEvent(`${e.name} returned to hand`); await delay(200); break;
      case 'gain-gold':
        showFloatingNumber(fx, `+${e.amount} ⛁`, '#fde047', e.side);
        logEvent(`${e.side === 'player' ? 'You' : 'AI'} +${e.amount} gold`);
        await delay(300); break;
      case 'power-counter': logEvent(`${e.name} +${e.amount} permanent power`); await delay(200); break;
    }
    renderAll();
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
  if (_mode === 'sacrifice-pick' || _mode === 'combat-attackers' || _mode === 'combat-blockers' || _mode === 'target-pick') {
    showStatus('Finish current action first'); return;
  }

  closePreview();
  _selectedHandInstId = null;
  // Clear once-per-turn ability flags
  ['player', 'ai'].forEach(s => {
    [...(G[s]?.creatures || []), ...(G[s]?.relics || [])].forEach(x => {
      if (x) delete x._abilityUsedThisTurn;
    });
  });
  endTurn();
  // After endTurn, the active player has changed. Renew the new active side.
  renewPermanents(G.activePlayer);
  renderAll();

  if (G.activePlayer === 'ai' && !G.winner) {
    _aiTurnRunning = true;
    const btn = _container.querySelector('#btn-end-turn');
    btn.style.opacity = '0.4';
    btn.style.pointerEvents = 'none';
    sfx('turn_end', 0.6);
    showTurnBanner("AI'S TURN", 'ai');
    showPhaseTransition('renew');
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

      // AI casts spells
      const spellEvents = aiCastSpells((a) => {
        if (a.type === 'cast') logEvent(`AI casts ${a.card.name}`);
        renderAll();
      });
      if (spellEvents.length > 0) {
        await playSpellEvents(spellEvents);
        await delay(200);
      }

      // AI activates abilities (before combat for proactive plays)
      const abilEvents = aiActivateAbilities((a) => {
        if (a.type === 'activate') logEvent(`AI activates ${a.card.name}`);
        renderAll();
      });
      if (abilEvents.length > 0) {
        await playSpellEvents(abilEvents);
        await delay(200);
      }

      checkWinCondition();
      if (G.winner) showWinner();

      await delay(300);
      if (!G.winner) { await runAiCombatPhase(); await delay(300); }
      if (!G.winner && G.activePlayer === 'ai') endTurn();
    } catch (err) {
      console.error('[turn] AI error', err);
      if (G.activePlayer === 'ai') { try { endTurn(); } catch (e) {} }
    }

    // AI's turn is done — control should now be back with player. Renew player's permanents.
    if (G.activePlayer === 'player') {
      renewPermanents('player');
    }

    _aiTurnRunning = false;
    btn.style.opacity = '';
    btn.style.pointerEvents = '';
    enforceHandCap();
    renderAll();
    if (!G.winner) {
      sfx('turn_end', 0.6);
      showTurnBanner('YOUR TURN', 'player');
      showPhaseTransition('renew');
      playGoldPulse('player', G.player.gold);
      logEvent(`— Your turn (T${G.turn}) —`);
    }
  }
  if (G.winner) showWinner();
}

// ═══════════════════════════════════════════════════════════
// HAND CARD GESTURES
// ═══════════════════════════════════════════════════════════

function attachHandCardGestures(slotEl, inst) {
  attachCardGestures(slotEl, {
    onTap: () => {
      if (_mode === 'discard') {
        const result = discardFromHand('player', inst.instId);
        if (result.ok) { showStatus(`Discarded ${inst.name}`); enforceHandCap(); renderAll(); }
        return;
      }
      if (_mode !== 'normal') return;
      if (_selectedHandInstId === inst.instId) {
        attemptPlayCard(inst);
      } else {
        _selectedHandInstId = inst.instId;
        renderAll();
      }
    },
    onLongPress: () => {
      if (_mode === 'discard' || _mode === 'sacrifice-pick' || _mode === 'target-pick') return;
      openPreview(inst, 'hand');
    },
    onDragStart: () => {
      if (_mode !== 'normal') return;
      if (G.activePlayer !== 'player') return;
      closePreview();
      _draggedHandInstId = inst.instId;
      const rect = slotEl.getBoundingClientRect();
      _draggedClone = slotEl.cloneNode(true);
      _draggedClone.style.cssText = `position:fixed; left:${rect.left}px; top:${rect.top}px; width:${rect.width}px; height:${rect.height}px; transform: rotate(0deg) scale(1.15); z-index:8500; pointer-events:none; transition:none; opacity:0.95; filter: drop-shadow(0 8px 20px rgba(234, 179, 8, 0.8));`;
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
      if (_draggedClone) { _draggedClone.remove(); _draggedClone = null; }
      slotEl.style.opacity = '';
      const playfield = _container.querySelector('.battle-playfield');
      if (!playfield) { _draggedHandInstId = null; return; }
      const pfRect = playfield.getBoundingClientRect();
      const relY = (y - pfRect.top) / pfRect.height;
      if (relY < 0.85) attemptPlayCard(inst);
      _draggedHandInstId = null;
    },
  });
}

function attemptPlayCard(inst) {
  if (G.activePlayer !== 'player') { showStatus('Not your turn'); return; }
  if (_aiTurnRunning) { showStatus('AI is playing'); return; }
  if (_mode !== 'normal' && _mode !== 'discard') { showStatus('Finish current action first'); return; }
  const cardType = inst.type || 'Unknown';
  const isCreature = PLAYABLE_AS_CREATURE.includes(cardType);
  const isSpell = SPELLS.includes(cardType);
  const isRelic = RELICS_TYPES.includes(cardType);

  if (isSpell) {
    // NEW: route to spell flow
    const check = canPlaySpell('player', inst.instId);
    if (!check.ok) { showStatus(check.error); return; }

    const reqs = getSpellTargetRequirements(inst);
    if (reqs.length === 0) {
      // No targets — fire immediately
      finalizeSpellPlay(inst, []);
      return;
    }
    // Enter target-pick mode
    startTargetPick({
      kind: 'spell',
      inst,
      side: 'player',
      targetReqs: reqs,
    });
    return;
  }

  if (!isCreature && !isRelic) { showStatus(`${cardType} not yet supported`); return; }

  if (isRelic) {
    const goldCost = inst.goldCost || 0;
    const bloodCost = inst.bloodCost || 0;
    if ((G.player.gold || 0) < goldCost) { showStatus(`Need ${goldCost} gold`); return; }
    if ((G.player.blood || 0) <= bloodCost) { showStatus(`Cannot pay ${bloodCost} blood`); return; }
    if (isRelicBoardFull('player')) { enterSacrificePickMode(inst, 'relic'); return; }
    const result = playRelicFromHand('player', inst.instId);
    if (result.ok) {
      sfx('card_play', 0.5);
      hapticAct();
      inst._justArrived = true;
      logEvent(`You play relic ${inst.name}`);
      _selectedHandInstId = null; closePreview(); renderAll();
    } else showStatus(result.error);
    return;
  }

  if (!canAffordInst(inst)) {
    showStatus(`Need ${inst.goldCost}⛁ ${inst.bloodCost > 0 ? '+ ' + inst.bloodCost + '🩸' : ''}`);
    return;
  }
  if (isCreatureBoardFull('player')) { enterSacrificePickMode(inst, 'creature'); return; }
  const result = playCardFromHand(inst);
  if (result.ok) {
    sfx('card_play', 0.5);
    hapticAct();
    inst._justArrived = true;
    logEvent(`You play ${inst.name}`);
    _selectedHandInstId = null; closePreview(); renderAll();
  } else showStatus(result.error);
}

async function finalizeSpellPlay(inst, targets) {
  const result = playSpellFromHand('player', inst.instId, targets);
  if (!result.ok) { showStatus(result.error); return; }
  sfx('card_play', 0.5);
  hapticAct();
  logEvent(`You cast ${inst.name}`);
  _selectedHandInstId = null;
  renderAll();
  await playSpellEvents(result.events || []);
  checkWinCondition();
  if (G.winner) showWinner();
  renderAll();
}

// ═══════════════════════════════════════════════════════════
// TARGET PICKING (used by both spells & abilities)
// ═══════════════════════════════════════════════════════════

function startTargetPick(ctx) {
  _pickContext = { ...ctx, collected: [], currentIdx: 0 };
  _mode = 'target-pick';
  _selectedHandInstId = null;
  closePreview();
  showCurrentTargetBanner();
  renderAll();
}

function showCurrentTargetBanner() {
  if (!_pickContext) return;
  const req = _pickContext.targetReqs[_pickContext.currentIdx];
  const sourceName = _pickContext.inst.name;
  const stepText = req
    ? `<div>${_pickContext.kind === 'spell' ? '✨' : '⚙'} ${sourceName} — choose <strong>${req.label}</strong></div>`
    : `<div>Confirming...</div>`;
  const optionalSkip = req?.optional
    ? `<button class="banner-cancel-btn" id="btn-skip-target" style="background:#475569;">SKIP TARGET</button>`
    : '';
  showModeBanner(`
    ${stepText}
    <button class="banner-cancel-btn" id="btn-cancel-pick">CANCEL</button>
    ${optionalSkip}
  `);
  setTimeout(() => {
    _container.querySelector('#btn-cancel-pick')?.addEventListener('click', cancelTargetPick);
    _container.querySelector('#btn-skip-target')?.addEventListener('click', skipOptionalTarget);
  }, 0);
}

function cancelTargetPick() {
  _pickContext = null;
  _mode = 'normal';
  hideModeBanner();
  renderAll();
}

function skipOptionalTarget() {
  if (!_pickContext) return;
  _pickContext.collected.push(null);
  _pickContext.currentIdx++;
  advanceTargetPick();
}

function advanceTargetPick() {
  if (!_pickContext) return;
  if (_pickContext.currentIdx >= _pickContext.targetReqs.length) {
    // All collected — execute
    const filtered = _pickContext.collected.filter(t => t !== null);
    executeTargetedAction(_pickContext, filtered);
    return;
  }
  showCurrentTargetBanner();
  renderAll();
}

function executeTargetedAction(ctx, targets) {
  if (ctx.kind === 'spell') {
    const inst = ctx.inst;
    _pickContext = null;
    _mode = 'normal';
    hideModeBanner();
    finalizeSpellPlay(inst, targets);
  } else if (ctx.kind === 'ability') {
    finalizeAbilityActivation(ctx, targets);
  }
}

function isValidTargetForCurrent(target) {
  if (!_pickContext) return false;
  const req = _pickContext.targetReqs[_pickContext.currentIdx];
  if (!req) return false;
  const valid = getValidTargets(req.type, _pickContext.side, req.filter);
  return valid.some(v =>
    v.kind === target.kind &&
    v.side === target.side &&
    (v.slotIdx === undefined || v.slotIdx === target.slotIdx)
  );
}

function pickTarget(target) {
  if (!_pickContext) return;
  if (!isValidTargetForCurrent(target)) {
    showStatus('Invalid target');
    return;
  }
  _pickContext.collected.push(target);
  _pickContext.currentIdx++;
  advanceTargetPick();
}

// ═══════════════════════════════════════════════════════════
// BATTLEFIELD GESTURES
// ═══════════════════════════════════════════════════════════

function attachBattlefieldGestures(slotEl, inst, kind) {
  const useDoubleTap = (_mode === 'normal');

  attachCardGestures(slotEl, {
    enableDoubleTap: useDoubleTap,
    onTap: () => {
      const side = slotEl.dataset.side;
      const slotIdx = parseInt(slotEl.dataset.slotIdx ?? slotEl.dataset.relicIdx, 10);

      if (_mode === 'target-pick') {
        pickTarget({ kind, side, slotIdx });
        return;
      }
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
      tryActivateAbility(side, kind, slotIdx);
    },
    onLongPress: () => {
      if (_mode === 'target-pick') return;
      openPreview(inst, 'battlefield');
    },
  });
}

function tryActivateAbility(side, kind, slotIdx) {
  const arr = kind === 'creature' ? G[side].creatures : G[side].relics;
  const inst = arr[slotIdx];
  if (!inst) return;

  if (!hasActivatedAbility(inst)) {
    showStatus(`${inst.name} has no activated ability`);
    return;
  }

  const check = canActivateAbility(side, kind, slotIdx);
  if (!check.ok) { showStatus(check.error); return; }

  const reqs = getAbilityTargetRequirements(side, kind, slotIdx);
  if (reqs.length === 0) {
    finalizeAbilityActivation({ kind: 'ability', inst, side, slotIdx, sourceKind: kind }, []);
    return;
  }
  startTargetPick({
    kind: 'ability',
    inst,
    side,
    slotIdx,
    sourceKind: kind,
    targetReqs: reqs,
  });
}

async function finalizeAbilityActivation(ctx, targets) {
  const result = activateAbility(ctx.side, ctx.sourceKind, ctx.slotIdx, targets);
  _pickContext = null;
  _mode = 'normal';
  hideModeBanner();
  if (!result.ok) { showStatus(result.error); renderAll(); return; }
  logEvent(`Activated ${ctx.inst.name}'s ability`);
  renderAll();
  await playSpellEvents(result.events || []);
  checkWinCondition();
  if (G.winner) showWinner();
  renderAll();
}

function onAttackerSlotPick(slotIdx) {
  const inst = G.player.creatures[slotIdx];
  if (!inst) return;
  if (inst._attacking) undeclareAttacker('player', slotIdx);
  else {
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

// ═══════════════════════════════════════════════════════════
// PREVIEW
// ═══════════════════════════════════════════════════════════

function openPreview(inst, source = 'hand') {
  const overlay = _container.querySelector('#card-preview-overlay');
  overlay.innerHTML = '';
  const wrapper = document.createElement('div');
  wrapper.className = 'preview-wrapper';
  wrapper.appendChild(createCardElement(inst, 'preview'));

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
  _mode = 'normal'; _pendingPlayInst = null; _sacrificeTargetType = 'creature';
  hideModeBanner(); renderAll();
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

function openDiscardViewer(side) {
  const discard = G[side]?.discard || [];
  const overlay = _container.querySelector('#card-preview-overlay');
  overlay.innerHTML = '';

  const wrapper = document.createElement('div');
  wrapper.style.cssText = `
    background: rgba(15, 10, 25, 0.96);
    border: 2px solid rgba(192, 132, 252, 0.5);
    border-radius: 12px;
    padding: 16px;
    width: 92%;
    max-height: 85vh;
    overflow-y: auto;
    box-shadow: 0 8px 40px rgba(0,0,0,0.95), 0 0 30px rgba(192,132,252,0.4);
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    color: #e9d5ff;
    font-family: 'Cinzel Decorative', serif;
  `;
  const label = side === 'player' ? 'Your Discard' : "Opponent's Discard";
  header.innerHTML = `
    <span style="font-size: 16px; font-weight: 700; letter-spacing: 2px;">${label} (${discard.length})</span>
    <button id="btn-close-discard" style="background: rgba(244, 63, 94, 0.2); border: 1px solid rgba(244, 63, 94, 0.6); color: #fca5a5; padding: 6px 14px; border-radius: 6px; cursor: pointer; font-family: inherit; font-weight: 700;">✕ CLOSE</button>
  `;
  wrapper.appendChild(header);

  if (discard.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:#94a3b8; text-align:center; padding:32px; font-style:italic;';
    empty.textContent = 'Discard pile is empty.';
    wrapper.appendChild(empty);
  } else {
    const grid = document.createElement('div');
    grid.style.cssText = `display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;`;
    // Newest first
    [...discard].reverse().forEach(inst => {
      const cardSlot = document.createElement('div');
      cardSlot.style.cssText = 'aspect-ratio: 5/7; cursor: pointer;';
      const card = createCardElement(inst, 'hand');
      card.style.width = '100%';
      card.style.height = '100%';
      cardSlot.appendChild(card);
      cardSlot.addEventListener('click', (e) => {
        e.stopPropagation();
        openPreview(inst, 'discard');
      });
      grid.appendChild(cardSlot);
    });
    wrapper.appendChild(grid);
  }

  overlay.appendChild(wrapper);
  setTimeout(() => {
    wrapper.querySelector('#btn-close-discard')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closePreview();
    });
  }, 0);
  overlay.onclick = (e) => { if (e.target === overlay) closePreview(); };
  overlay.classList.remove('hidden');
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
    content.innerHTML = `<p>Mute and animation speed coming.</p><button class="home-btn home-btn-warn" id="btn-end-game">End Game (return home)</button>`;
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

// ═══════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════

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
  endBtn.style.display = (inCombatAttackers || _mode === 'combat-blockers' || _mode === 'target-pick') ? 'none' : 'flex';
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
  // Update deck and discard counts for both sides
  for (const side of ['player', 'ai']) {
    const deckCount = G[side]?.deck?.length || 0;
    const discardCount = G[side]?.discard?.length || 0;
    setBoundText(`${side}.deck.length`, deckCount);
    setBoundText(`${side}.discard.length`, discardCount);
  }
}

function applyCombatVisuals(slotEl, inst, isPlayerSide) {
  slotEl.style.outline = '';
  slotEl.style.outlineOffset = '';
  slotEl.style.boxShadow = '';
  const existingIcon = slotEl.querySelector('.combat-attack-icon');
  if (existingIcon) existingIcon.remove();

  if (!inst) return;

  if (inst._attacking) {
    slotEl.style.outline = '3px solid #f43f5e';
    slotEl.style.outlineOffset = '2px';
    slotEl.style.boxShadow = '0 0 24px rgba(244, 63, 94, 0.85), inset 0 0 12px rgba(244, 63, 94, 0.4)';
    slotEl.style.borderRadius = '8px';
    const icon = document.createElement('div');
    icon.className = 'combat-attack-icon';
    icon.textContent = '⚔';
    icon.style.cssText = `position: absolute; top: -22px; left: 50%; transform: translateX(-50%); font-size: 28px; color: #f43f5e; text-shadow: 0 0 12px #f43f5e, 0 0 4px #fff, 0 2px 4px rgba(0,0,0,0.95); z-index: 50; pointer-events: none; animation: attack-bounce 1s ease-in-out infinite;`;
    slotEl.appendChild(icon);
    return;
  }

  if (_mode === 'combat-attackers' && isPlayerSide && !inst.exhausted && !inst.overexhausted && (inst.power || 0) > 0) {
    slotEl.style.outline = '2px dashed rgba(244, 63, 94, 0.7)';
    slotEl.style.outlineOffset = '4px';
    slotEl.style.boxShadow = '0 0 16px rgba(244, 63, 94, 0.4)';
    slotEl.style.borderRadius = '8px';
    return;
  }

  if (_mode === 'combat-blockers' && isPlayerSide && !inst.exhausted && !inst.overexhausted) {
    slotEl.style.outline = '2px dashed rgba(96, 165, 250, 0.8)';
    slotEl.style.outlineOffset = '4px';
    slotEl.style.boxShadow = '0 0 16px rgba(96, 165, 250, 0.5)';
    slotEl.style.borderRadius = '8px';
    return;
  }

  if (_mode === 'combat-blockers' && !isPlayerSide) {
    const slotIdx = parseInt(slotEl.dataset.slotIdx, 10);
    if (slotIdx === _pendingBlockerForAttackerIdx) {
      slotEl.style.outline = '3px solid #fde047';
      slotEl.style.outlineOffset = '2px';
      slotEl.style.boxShadow = '0 0 24px rgba(253, 224, 71, 0.85)';
      slotEl.style.borderRadius = '8px';
    }
  }
}

function applyTargetPickVisuals(slotEl, kind, side, slotIdx) {
  if (_mode !== 'target-pick' || !_pickContext) return false;
  const target = { kind, side, slotIdx };
  if (isValidTargetForCurrent(target)) {
    slotEl.style.outline = '3px dashed #c084fc';
    slotEl.style.outlineOffset = '4px';
    slotEl.style.boxShadow = '0 0 20px rgba(192, 132, 252, 0.8), inset 0 0 10px rgba(192, 132, 252, 0.3)';
    slotEl.style.borderRadius = '8px';
    return true;
  }
  return false;
}

function ensureCombatAnimations() {
  if (document.getElementById('combat-anim-styles')) return;
  const style = document.createElement('style');
  style.id = 'combat-anim-styles';
  style.textContent = `
    @keyframes attack-bounce { 0%, 100% { transform: translateX(-50%) scale(1); } 50% { transform: translateX(-50%) scale(1.2); } }
    @keyframes target-pulse { 0%, 100% { box-shadow: 0 0 16px rgba(192, 132, 252, 0.6); } 50% { box-shadow: 0 0 28px rgba(192, 132, 252, 1); } }
  `;
  document.head.appendChild(style);
}

function renderBoard(side) {
  ensureCombatAnimations();
  const slots = G[side].creatures;
  const sideClass = side === 'ai' ? 'opp' : 'pla';
  const isPlayerSide = side === 'player';

  for (let i = 0; i < 4; i++) {
    const slotEl = _container.querySelector(`.overlay-slots-${sideClass} .board-slot[data-slot-idx="${i}"]`);
    if (!slotEl) continue;
    const host = slotEl.querySelector('.slot-card-host');
    host.innerHTML = '';
    const inst = slots[i];
    if (inst) {
      slotEl.classList.remove('empty');
      const cardEl = createCardElement(inst, 'battlefield');
      cardEl.style.transition = 'transform 0.35s cubic-bezier(.3,.1,.3,1.2), filter 0.35s';
      if (inst.overexhausted) {
        cardEl.style.transform = 'rotate(180deg) scale(0.88)';
        cardEl.style.filter = 'brightness(0.5) saturate(0.5)';
      } else if (inst.exhausted) {
        cardEl.style.transform = 'rotate(90deg) scale(0.92)';
        cardEl.style.filter = 'brightness(0.7) saturate(0.75)';
      } else {
        cardEl.style.transform = '';
        cardEl.style.filter = '';
      }
      host.appendChild(cardEl);
      if (inst._justArrived) { cardArrive(cardEl); delete inst._justArrived; }
    } else {
      slotEl.classList.add('empty');
    }

    applyCombatVisuals(slotEl, inst, isPlayerSide);
    applyTargetPickVisuals(slotEl, 'creature', side, i);

    if (_mode === 'sacrifice-pick' && isPlayerSide && _sacrificeTargetType === 'creature' && inst) {
      slotEl.style.outline = '3px solid #fb923c';
      slotEl.style.outlineOffset = '2px';
      slotEl.style.boxShadow = '0 0 24px rgba(251, 146, 60, 0.7)';
      slotEl.style.borderRadius = '8px';
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
    slotEl.style.outline = '';
    slotEl.style.boxShadow = '';
    const host = slotEl.querySelector('.relic-slot-host');
    host.innerHTML = '';
    const inst = relics[i];
    if (inst) {
      slotEl.classList.remove('empty');
      const cardEl = createCardElement(inst, 'battlefield');
      cardEl.style.width = '100%';
      cardEl.style.height = '100%';
      cardEl.style.transition = 'transform 0.35s cubic-bezier(.3,.1,.3,1.2), filter 0.35s';
      if (inst.overexhausted) {
        cardEl.style.transform = 'rotate(180deg) scale(0.88)';
        cardEl.style.filter = 'brightness(0.5) saturate(0.5)';
      } else if (inst.exhausted) {
        cardEl.style.transform = 'rotate(90deg) scale(0.92)';
        cardEl.style.filter = 'brightness(0.7) saturate(0.75)';
      }
      host.appendChild(cardEl);
      if (inst._justArrived) { cardArrive(cardEl); delete inst._justArrived; }
    } else {
      slotEl.classList.add('empty');
    }

    applyTargetPickVisuals(slotEl, 'relic', side, i);

    if (_mode === 'sacrifice-pick' && side === 'player' && _sacrificeTargetType === 'relic' && inst) {
      slotEl.style.outline = '3px solid #fb923c';
      slotEl.style.outlineOffset = '2px';
      slotEl.style.boxShadow = '0 0 24px rgba(251, 146, 60, 0.7)';
      slotEl.style.borderRadius = '8px';
    }
  }

  _container.querySelectorAll(`.overlay-relics-${sideClass} .relic-slot`).forEach(s => {
    const clone = s.cloneNode(true);
    s.parentNode.replaceChild(clone, s);
    const idx = parseInt(clone.dataset.relicIdx, 10);
    const inst = G[side].relics[idx];
    if (inst) attachBattlefieldGestures(clone, inst, 'relic');
  });

  // Apply target-pick visual to vital labels (for player targets)
  if (_mode === 'target-pick' && _pickContext) {
    ['player', 'ai'].forEach(s => {
      const vital = _container.querySelector(`.overlay-vitals-${s === 'player' ? 'player' : 'opponent'}`);
      if (!vital) return;
      vital.style.outline = '';
      vital.style.boxShadow = '';
      if (isValidTargetForCurrent({ kind: 'player', side: s })) {
        vital.style.outline = '3px dashed #c084fc';
        vital.style.outlineOffset = '4px';
        vital.style.boxShadow = '0 0 20px rgba(192, 132, 252, 0.8)';
        vital.style.borderRadius = '8px';
        vital.style.cursor = 'pointer';
        vital.onclick = () => pickTarget({ kind: 'player', side: s });
      } else {
        vital.onclick = null;
        vital.style.cursor = '';
      }
    });
  } else {
    ['player', 'ai'].forEach(s => {
      const vital = _container.querySelector(`.overlay-vitals-${s === 'player' ? 'player' : 'opponent'}`);
      if (vital) {
        vital.style.outline = '';
        vital.style.boxShadow = '';
        vital.style.cursor = '';
        vital.onclick = null;
      }
    });
  }
}

function renderHand() {
  const fan = _container.querySelector('#hand-fan-overlay');
  if (!fan) return;
  fan.innerHTML = '';
  const hand = G.player.hand;
  const total = hand.length;
  const currentIds = new Set(hand.map(i => i.instId));
  const newIds = [...currentIds].filter(id => !_prevHandInstIds.has(id));
  _prevHandInstIds = currentIds;
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
    const cardType = inst.type || '';
    const isSpell = SPELLS.includes(cardType);
    let affordable;
    if (isRelic) {
      affordable = (G.player.gold || 0) >= (inst.goldCost || 0)
        && (G.player.blood || 0) > (inst.bloodCost || 0)
        && G.activePlayer === 'player';
    } else if (isSpell) {
      affordable = (G.player.gold || 0) >= (inst.goldCost || 0)
        && G.activePlayer === 'player'
        && isSpellSupported(inst);
    } else {
      affordable = canAffordInst(inst) && G.activePlayer === 'player';
    }
    if (!affordable && _mode !== 'discard') card.classList.add('unaffordable');

    if (isSelected) {
      card.style.border = '3px solid #fde047';
      card.style.boxShadow = '0 8px 24px rgba(0,0,0,0.95), 0 0 32px rgba(234, 179, 8, 0.85), inset 0 0 22px rgba(234, 179, 8, 0.2)';
    }

    attachHandCardGestures(slot, inst);
    slot.appendChild(card);
    fan.appendChild(slot);
    if (newIds.includes(inst.instId)) cardDrawEnter(card);
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
  const stats = {
    turn: G.turn,
    cardsPlayed: (G.stats?.cardsPlayed?.player || 0),
    damageDealt: (G.stats?.damageDealt?.player || 0),
  };
  showEndgame(G.winner, stats);
  bgmPause();
  if (G.winner === 'player') hapticWin();
  else hapticDamage();

  setTimeout(() => {
    document.getElementById('eg-btn-play-again')?.addEventListener('click', () => {
      removeOverlays(); removeMuteButton();
      import('./battle-screen.js').then(m => {
        const app = document.getElementById('app');
        app.innerHTML = '';
        m.mountBattleScreen(app);
      });
    });
    document.getElementById('eg-btn-home')?.addEventListener('click', () => {
      removeOverlays(); removeMuteButton();
      import('./home-screen.js').then(m => m.mountHomeScreen?.(document.getElementById('app')));
    });
  }, 600);
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

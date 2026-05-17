// ─────────────────────────────────────────────────────────────
// Battle state foundation
//
// G is the single source of truth for an in-progress battle.
// Modules read/write G directly; UI reads G to render.
//
// Card instances (insts) are created from cards.js card definitions.
// Each inst has its own runtime state (damageTaken, exhaustState, tokens, etc.)
// while the underlying card data stays immutable.
// ─────────────────────────────────────────────────────────────

import { CARDS_BY_ID } from './cards.js';
import { hasKeyword } from './keywords.js';
import { extractKeywords } from './keyword-parser.js';

// Module-level instance ID counter — unique per battle.
let _nextInstId = 1;

// Module-level G reference. Exported for read-only access; mutators below.
export let G = null;

// ── State construction ───────────────────────────────────────

export function makeInitialState({ playerFaction, aiFaction, playerDeck, aiDeck }) {
  _nextInstId = 1;

  G = {
    turn: 1,
    activePlayer: 'player',
    phase: 'renew',         // 'renew' | 'main' | 'combat' | 'end'

    playerFaction,
    aiFaction,

    player: makeSideState(playerDeck, /*starting blood*/ 30),
    ai:     makeSideState(aiDeck,     /*starting blood*/ 30),

    // Combat state (populated during combat phase)
    combat: null,           // { attackers: [], blocks: { attackerInstId: { blockerInstId, supporterInstIds:[] } } }

    // Win/loss
    winner: null,           // null | 'player' | 'ai'

    // Stats for end-of-game summary
    stats: {
      damageDealt: { player: 0, ai: 0 },
      cardsPlayed: { player: 0, ai: 0 },
      bleedDealt:  { player: 0, ai: 0 },
    },
  };

  // Draw starting hands (5 cards each)
  drawCards('player', 5);
  drawCards('ai', 5);

  return G;
}

function makeSideState(deck, startingBlood) {
  return {
    blood: startingBlood,         // HP and spell currency (single pool)
    bleedPool: 0,                 // accumulates bleed; resolves at end of own turn
    gold: 0,                      // turn N = N gold, capped at 10
    maxGoldThisTurn: 0,           // for UI display "3/3"

    hand: [],                     // array of insts (cards drawn but not played)
    deck: shuffle([...deck]),     // remaining deck (draw from end via .pop())
    discard: [],                  // graveyard

    creatures: [null, null, null, null, null], // 5 slots per RULES §1.1; null = empty
    relics: [null, null, null, null],          // 4 slots
  };
}

// Fisher-Yates shuffle (in place, returns same array)
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Card instance factory ────────────────────────────────────

export function makeInst(cardId, owner) {
  const card = CARDS_BY_ID[cardId];
  if (!card) {
    console.error(`[state] makeInst — unknown card ID: ${cardId}`);
    return null;
  }
  return {
    instId: _nextInstId++,
    cardId,
    name: card.name,
    type: card.type,
    subtype: card.subtype || null,
    faction: card.faction,
    image: card.image,
    abilities: card.abilities,
    flavor: card.flavor,

    // Cost (snapshot from card data)
    goldCost: card.goldCost,
    bloodCost: card.bloodCost,

    // Power (creatures only)
    basePower: card.power || 0,
    damageTaken: 0,            // resets at end of turn

    // Owner / location
    owner,                     // 'player' | 'ai'
    location: 'deck',          // 'deck' | 'hand' | 'creatures' | 'relics' | 'discard' | 'exile'
    slotIdx: null,             // index in creatures[] or relics[]

    // Standing keywords parsed from ability text
    keywords: extractKeywords(card.abilities),

    // Per-instance temp state
    exhaustState: 'renewed',   // 'renewed' | 'exhausted' | 'overexhausted'
    newlyTurned: true,         // summoning sickness; cleared at start of next turn
    attacking: false,
    blocking: false,
    supporting: false,

    // Orbiting tokens — array of token names (e.g. ['Raven', 'Bat'])
    // Max 5 per host per RULES §9.2. Tokens grant bonuses calculated in getEffectivePower.
    tokens: [],

    // Temporary keyword grants (e.g. spells that give Haste until EOT)
    tempKeywords: {},

    // Per-instance bonus tracking (e.g. "+1 power until EOT")
    powerMods: 0,
  };
}

// ── Effective power calculation ──────────────────────────────

export function getEffectivePower(inst) {
  if (!inst) return 0;
  let pw = inst.basePower + (inst.powerMods || 0);

  // Token bonuses (base per §9.3)
  for (const tokName of inst.tokens || []) {
    if (tokName === 'Raven') pw += 1;
    else if (tokName === 'Bat') pw += 1;
    else if (tokName === 'Wolf') pw += 2;
    else if (tokName === 'Zombie') pw += 3;
  }

  // ── Passive power bonuses from in-play creatures/relics ──
  const owner = inst.owner; // 'player' | 'ai'
  if (G && owner) {
    const ownerCreatures = G[owner]?.creatures || [];

    // Nightwing Defiler: +1 EXTRA per Bat or Raven token (on top of base +1 each)
    if (inst.name === 'Nightwing Defiler') {
      pw += (inst.tokens || []).filter(t => t === 'Bat' || t === 'Raven').length;
    }

    // Korzathrax, Marrow Sovereign: Zombie/Raven/Bat tokens you control get +1 power
    const hasKorzathrax = ownerCreatures.some(c => c && c !== inst && c.name === 'Korzathrax, Marrow Sovereign');
    if (hasKorzathrax) {
      for (const tok of inst.tokens || []) {
        if (tok === 'Zombie' || tok === 'Raven' || tok === 'Bat') pw += 1;
      }
    }

    // Hornshadow Stringlord: all token creatures you control gain +1 power per token
    const hasHornshadow = ownerCreatures.some(c => c && c !== inst && c.name === 'Hornshadow Stringlord');
    if (hasHornshadow) {
      pw += (inst.tokens || []).length;
    }

    // Velocity Glitcher: +1 power per bleed counter on controller
    if (inst.name === 'Velocity Glitcher') {
      pw += G[owner]?.bleedPool || 0;
    }

    // Liora / Cassian Gateward pair: +1 power if partner is also in play
    if (inst.name === 'Liora Gateward') {
      if (ownerCreatures.some(c => c?.name === 'Cassian Gateward')) pw += 1;
    }
    if (inst.name === 'Cassian Gateward') {
      if (ownerCreatures.some(c => c?.name === 'Liora Gateward')) pw += 1;
    }

    // Rayfield Infiltrator: Hemorrhage — +1 power per bleed while attacking
    // (_attacking flag is set during combat declaration)
    if (inst.name === 'Rayfield Infiltrator' && inst._attacking) {
      pw += G[owner]?.bleedPool || 0;
    }
  }

  // Subtract damage taken (display only — for "x/y" rendering, see UI layer)
  // The actual destroyed-on-damage check is `damageTaken >= effectivePower`.
  return Math.max(0, pw);
}

export function isDestroyed(inst) {
  return inst && (inst.damageTaken >= getEffectivePower(inst));
}

// ── Token helpers ────────────────────────────────────────────

const ORBIT_TOKEN_TYPES = new Set(['Raven', 'Bat', 'Wolf', 'Zombie']);

export function isOrbitToken(name) { return ORBIT_TOKEN_TYPES.has(name); }

export function attachToken(host, tokenName) {
  if (!host || !isOrbitToken(tokenName)) return false;
  if (host.tokens.length >= 5) return false;  // capped at 5 per RULES §9.2
  host.tokens.push(tokenName);
  return true;
}

export function removeToken(host, tokenName) {
  const idx = host.tokens.indexOf(tokenName);
  if (idx >= 0) {
    host.tokens.splice(idx, 1);
    return true;
  }
  return false;
}

// ── Hand / deck ──────────────────────────────────────────────

export function drawCards(who, n) {
  const side = G[who];
  const drawn = [];
  for (let i = 0; i < n; i++) {
    if (side.deck.length === 0) {
      // Deckout damage: 1 Blood per missed draw (§3.2)
      side.blood = Math.max(0, (side.blood || 0) - 1);
      if (side.blood <= 0) G.winner = (who === 'player' ? 'ai' : 'player');
      continue;
    }
    const inst = side.deck.pop();
    inst.location = 'hand';
    side.hand.push(inst);
    drawn.push(inst);
  }
  return drawn;
}

// ── Slot placement ───────────────────────────────────────────

// Find lowest-index empty slot in creatures[] or relics[].
export function findEmptySlot(side, type) {
  const slots = type === 'Creature' ? side.creatures : side.relics;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] === null) return i;
  }
  return -1;
}

// ── Resource helpers ─────────────────────────────────────────

export function canAfford(who, goldCost, bloodCost) {
  const side = G[who];
  return side.gold >= goldCost && side.blood > bloodCost;
  // NOTE: blood > bloodCost (strict) — you can't pay exact remaining HP and live
}

export function pay(who, goldCost, bloodCost) {
  const side = G[who];
  side.gold -= goldCost;
  side.blood -= bloodCost;
  if (side.blood <= 0) G.winner = (who === 'player' ? 'ai' : 'player');
}

// Turn-start gold gain (called from turn cycler)
export function grantTurnGold(who) {
  const side = G[who];
  const target = Math.min(10, G.turn);
  side.gold = target;
  side.maxGoldThisTurn = target;
}

// End-of-turn cleanup
export function endTurnCleanup(who) {
  const side = G[who];
  // Drain bleed pool to HP
  if (side.bleedPool > 0) {
    side.blood -= side.bleedPool;
    side.bleedPool = 0;
    if (side.blood <= 0) G.winner = (who === 'player' ? 'ai' : 'player');
  }
  // Reset gold to 0
  side.gold = 0;
  side.maxGoldThisTurn = 0;
  // Clear damage on all creatures
  for (const inst of side.creatures) {
    if (inst) inst.damageTaken = 0;
  }
  // Clear temp keywords + power mods
  for (const inst of [...side.creatures, ...side.relics]) {
    if (inst) {
      inst.tempKeywords = {};
      inst.powerMods = 0;
    }
  }

  // Wall Decay (§3.5, §6.4): any wall that blocked this turn loses 1 Power.
  // Runs over both sides since walls on either side may have blocked.
  for (const sideKey of ['player', 'ai']) {
    const slots = G[sideKey]?.creatures || [];
    for (let i = slots.length - 1; i >= 0; i--) {
      const inst = slots[i];
      if (!inst || !inst._blockedThisTurn) continue;
      if (!hasKeyword(inst, 'WALL')) continue;
      inst.basePower = Math.max(0, inst.basePower - 1);
      if (inst.basePower <= 0) {
        // Destroy the wall immediately (§6.4 "if Power reaches 0, destroy it")
        if (Array.isArray(G[sideKey].discard)) G[sideKey].discard.push(inst);
        slots[i] = null;
      }
    }
  }

  // Marble Shield Sentinel: gains +1 permanent power when it blocked this turn
  for (const sideKey of ['player', 'ai']) {
    for (const inst of G[sideKey]?.creatures || []) {
      if (inst?._blockedThisTurn && inst.name === 'Marble Shield Sentinel') {
        inst.basePower = (inst.basePower || 0) + 1;
      }
    }
  }

  // Clear _blockedThisTurn flag from all creatures (both sides)
  for (const sideKey of ['player', 'ai']) {
    for (const inst of G[sideKey]?.creatures || []) {
      if (inst) delete inst._blockedThisTurn;
    }
  }
}

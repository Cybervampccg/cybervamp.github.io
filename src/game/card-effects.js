// ─────────────────────────────────────────────────────────────
// card-effects.js — Maps card names to structured effect data
//
// Each entry describes:
//   onPlay: effects that fire when spell is cast (or when permanent enters play)
//   activatedAbility: ability fired via double-tap, with cost + effects
//   targets: array of target descriptors needed before play
//
// To add support for a new card, add an entry keyed by card name.
// ─────────────────────────────────────────────────────────────

import { hasKeyword } from './keywords.js';

export const CARD_EFFECTS = {

  // ═══════════ RED SPELLS ═══════════

  'Overclock Surge': {
    targets: [{ type: 'creature', label: 'creature to buff' }],
    onPlay: [
      { type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' },
      // Note: "additional +1 if it has Bleed" is omitted (Bleed mechanic incomplete)
    ],
  },

  'Veinshock Pulse': {
    targets: [{ type: 'player', label: 'player whose creatures take damage' }],
    onPlay: [
      { type: 'all-creatures-damage', amount: 1, filter: 'enemyOfTarget' },
    ],
  },

  'Burnout': {
    targets: [{
      type: 'creature',
      label: 'overexhausted creature to destroy',
      filter: (t) => t.kind === 'creature' && !!t._inst?.overexhausted,
    }],
    onPlay: [{ type: 'destroy', target: 'target' }],
  },

  'Tower Raid': {
    targets: [
      { type: 'creature', label: 'first creature to exhaust' },
      { type: 'creature', label: 'second creature to exhaust', optional: true },
    ],
    onPlay: [
      { type: 'exhaust', target: 'target' },
      { type: 'exhaust', target: 'target2', skipIfMissing: true },
    ],
  },

  'Reckless Surge': {
    targets: [{ type: 'creature', label: 'creature to buff' }],
    onPlay: [
      { type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' },
      { type: 'GRANT_KEYWORD', keyword: 'BREACH', duration: 'endOfTurn', target: 'target' },
    ],
  },

  'Cut the Line': {
    targets: [{ type: 'creatureOrRelic', label: 'creature or relic to renew' }],
    onPlay: [{ type: 'renew', target: 'target' }],
  },

  // RED — Grid Hack Wallbuster: "Destroy target wall"
  'Grid Hack Wallbuster': {
    targets: [{
      type: 'creature',
      label: 'wall to destroy',
      filter: (t) => t.kind === 'creature' && hasKeyword(t._inst, 'WALL'),
    }],
    onPlay: [{ type: 'destroy', target: 'target' }],
  },

  // ═══════════ WHITE SPELLS ═══════════

  'Marble Ward': {
    targets: [{ type: 'creature', label: 'creature to buff' }],
    onPlay: [{ type: 'buff', power: 2, duration: 'endOfTurn', target: 'target' }],
  },

  'Purity Pulse': {
    targets: [{ type: 'player', label: 'player to cleanse' }],
    onPlay: [
      { type: 'removeBleed', amount: 2, target: 'target' },
      // We can't easily count "amount removed" so we draw a fixed amount
      { type: 'draw', amount: 1, target: 'controller' },
    ],
  },

  'Legacy Ward': {
    targets: [{ type: 'creature', label: 'blocking creature to buff' }],
    onPlay: [{ type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' }],
  },

  'Charitable Deed': {
    targets: [],
    onPlay: [
      { type: 'removeBleed', amount: 99, target: 'controller' },
      { type: 'removeBleed', amount: 99, target: 'opponent' },
    ],
  },

  'Gilded Rebuke': {
    targets: [{ type: 'creature', label: 'creature to neutralize' }],
    onPlay: [
      { type: 'exhaust', target: 'target' },
      { type: 'damage', amount: 2, target: 'targetController' },
    ],
  },

  'Ancestral Tribute': {
    targets: [{ type: 'relic', label: 'relic to destroy' }],
    onPlay: [{ type: 'destroy', target: 'target' }],
  },

  'Radiant Reprisal': {
    targets: [{ type: 'creature', label: 'attacking creature' }],
    onPlay: [
      { type: 'exhaust', target: 'target' },
      // "gain life equal to its power" — generic 2 heal for now
      { type: 'heal', amount: 2, target: 'controller' },
    ],
  },

  // ═══════════ BLACK SPELLS ═══════════

  "Death's Grasp": {
    targets: [{ type: 'creature', label: 'creature to destroy' }],
    onPlay: [{ type: 'destroy', target: 'target' }],
  },

  'Echo Siphon': {
    targets: [{ type: 'creature', label: 'creature to buff' }],
    onPlay: [{ type: 'buff', power: 3, duration: 'endOfTurn', target: 'target' }],
  },

  'Essence Siphon': {
    targets: [{ type: 'creature', label: 'creature to damage' }],
    onPlay: [
      { type: 'damage', amount: 2, target: 'target' },
      { type: 'heal', amount: 2, target: 'controller' },
    ],
  },

  'Grave Whisper': {
    targets: [],
    onPlay: [
      // Card: "Return target creature (power ≤2) from discard to hand"
      // Power filter not supported; returns most-recent card from discard.
      { type: 'returnFromDiscard' },
    ],
  },

  'Wicked Harvest': {
    targets: [{ type: 'creature', label: 'creature to buff' }],
    onPlay: [{ type: 'buff', power: 2, duration: 'endOfTurn', target: 'target' }],
  },

  // ═══════════ PURPLE SPELLS ═══════════

  'Psychic Shard': {
    targets: [{ type: 'creatureOrPlayer', label: 'damage target' }],
    onPlay: [
      { type: 'damage', amount: 1, target: 'target' },
      // "Glimpse 1" — not yet implemented; draw 1 as fallback
      { type: 'draw', amount: 1, target: 'controller' },
    ],
  },

  'Idle Thoughts': {
    targets: [{ type: 'creature', label: 'creature to exhaust' }],
    onPlay: [{ type: 'exhaust', target: 'target' }],
  },

  'Mist Trap': {
    targets: [{ type: 'creature', label: 'creature to bounce' }],
    onPlay: [{ type: 'returnToHand', target: 'target' }],
  },

  'Curse of Fatigue': {
    targets: [{
      type: 'creatureOrRelic',
      label: 'overexhausted target',
      filter: (t) => !!t._inst?.overexhausted,
    }],
    onPlay: [{ type: 'destroy', target: 'target' }],
  },

  'Drowsy Shroud': {
    targets: [
      { type: 'creature', label: 'first creature' },
      { type: 'creature', label: 'second creature', optional: true },
    ],
    onPlay: [
      { type: 'exhaust', target: 'target' },
      { type: 'exhaust', target: 'target2', skipIfMissing: true },
    ],
  },

  'Illusion Portal': {
    targets: [{ type: 'creature', label: 'attacking creature' }],
    onPlay: [{ type: 'exhaust', target: 'target' }],
  },

  'Focused Clairvoyance': {
    targets: [],
    onPlay: [{ type: 'draw', amount: 1, target: 'controller' }],
  },

  'Veilcataclysm': {
    targets: [],
    onPlay: [{ type: 'draw', amount: 1, target: 'controller' }],
  },

  'Prismatic Accord': {
    targets: [{ type: 'ownCreature', label: 'your creature to bounce' }],
    onPlay: [
      { type: 'returnToHand', target: 'target' },
      { type: 'gainGold', amount: 1 },
    ],
  },

  // ═══════════ ACTIVATED ABILITIES (creatures + relics) ═══════════

  // White creature: target creature -> destroy (once per turn)
  'Relicbound Drone Titan': {
    activatedAbility: {
      cost: { gold: 3, exhaust: true },
      targets: [{ type: 'creature', label: 'creature to destroy' }],
      effects: [{ type: 'destroy', target: 'target' }],
      oncePerTurn: true,
    },
  },

  // Purple creature: target attacker -> exhaust
  'Mystic Fledgling': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'creature', label: 'attacking creature' }],
      effects: [{ type: 'exhaust', target: 'target' }],
    },
  },

  // Red relic: exhaust -> -1 power blocker
  'AR Visor': {
    activatedAbility: {
      cost: { gold: 1, exhaust: true },
      targets: [{ type: 'creature', label: 'blocking creature' }],
      effects: [{ type: 'buff', power: -1, duration: 'endOfTurn', target: 'target' }],
    },
  },

  // Red relic: exhaust -> buff your creature +2
  'Glitch Tech Goggles': {
    activatedAbility: {
      cost: { gold: 2, exhaust: true },
      targets: [{ type: 'ownCreature', label: 'creature to buff' }],
      effects: [{ type: 'buff', power: 2, duration: 'endOfTurn', target: 'target' }],
    },
  },

  // Red relic: exhaust -> remove 1 bleed from target player
  'Hemotech Patch': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'player', label: 'player' }],
      effects: [{ type: 'removeBleed', amount: 1, target: 'target' }],
    },
  },

  // Red relic: exhaust -> lose 1 life, +1 gold
  'Crimson Vein Miner': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [],
      effects: [
        { type: 'damage', amount: 1, target: 'controller' },
        { type: 'gainGold', amount: 1 },
      ],
    },
  },

  // White relic: exhaust -> heal 1
  'Gilded Lifewell Chalice': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [],
      effects: [{ type: 'heal', amount: 1, target: 'controller' }],
    },
  },

  // White relic: exhaust + WWW -> destroy self, return relic from discard
  'Legacy Chronovault': {
    activatedAbility: {
      cost: { gold: 3, exhaust: true, sacrificeSelf: true },
      targets: [],
      effects: [{ type: 'draw', amount: 1, target: 'controller' }],
    },
  },

  // White relic: exhaust + W -> target creature gains Siphon
  'Ivory Hemaclaw': {
    activatedAbility: {
      cost: { gold: 1, exhaust: true },
      targets: [{ type: 'creature', label: 'creature to grant siphon' }],
      effects: [{ type: 'GRANT_KEYWORD', keyword: 'SIPHON', duration: 'endOfTurn', target: 'target' }],
    },
  },

  // White relic: overexhaust -> renew target relic
  'Celestial Sands': {
    activatedAbility: {
      cost: { gold: 1, overexhaust: true },
      targets: [{ type: 'relic', label: 'relic to renew' }],
      effects: [{ type: 'renew', target: 'target' }],
    },
  },

};

// ═══════════ EXPANSION — additional spells ═══════════
// Merging into CARD_EFFECTS below.

const EXPANSION = {

  // ─── RED ───

  'Blending In': {
    // Exhaust own creature → deal damage = its power to ANOTHER creature.
    // If destroyed, opp gets 1 bleed and you draw 1.
    targets: [
      { type: 'ownCreature', label: 'creature to exhaust (source)' },
      { type: 'creature', label: 'creature to damage' },
    ],
    onPlay: [
      { type: 'damageEqualTargetPower', exhaustSource: true },
      {
        type: 'ifLastDestroyed',
        then: [
          { type: 'addBleed', amount: 1, target: 'opponent' },
          { type: 'draw', amount: 1, target: 'controller' },
        ],
      },
    ],
  },

  'Flankwire Feint': {
    targets: [{ type: 'creature', label: 'attacking creature' }],
    onPlay: [
      // "Bleed triggers regardless of direct damage" — approximated as a small bleed bump + draw
      { type: 'addBleed', amount: 1, target: 'targetController' },
      { type: 'draw', amount: 1, target: 'controller' },
    ],
  },

  'Redline Frenzy': {
    // Card text: "Target creature gains +2 power, Breach, and Bleed +1 until end of turn"
    // Fixed in keyword-patch session: now grants real keywords.
    targets: [{ type: 'creature', label: 'creature to empower' }],
    onPlay: [
      { type: 'buff', power: 2, duration: 'endOfTurn', target: 'target' },
      { type: 'GRANT_KEYWORD', keyword: 'BREACH', duration: 'endOfTurn', target: 'target' },
      { type: 'GRANT_KEYWORD', keyword: 'BLEED:1', duration: 'endOfTurn', target: 'target' },
    ],
  },

  'Drone Hack': {
    targets: [{ type: 'creature', label: 'creature to neutralize' }],
    onPlay: [
      { type: 'exhaust', target: 'target' },
      // "controller gains bleed = half power rounded up" — approximated as 1 bleed
      { type: 'addBleed', amount: 1, target: 'targetController' },
    ],
  },

  'Blade Silhouette': {
    // Card text: "Target creature's bleed is doubled until end of turn"
    // (Pitch: Add {G} — pitch mode not yet implemented)
    // Fixed in keyword-patch session: uses MODIFY_BLEED_VALUE multiplier.
    targets: [{ type: 'creature', label: 'creature whose bleed is doubled' }],
    onPlay: [
      { type: 'MODIFY_BLEED_VALUE', op: 'multiply', value: 2, duration: 'endOfTurn', target: 'target' },
    ],
  },

  'Info Brokers': {
    // "Look at top 3, swap one with hand, rest on top in any order" — simplified to draw 1
    targets: [],
    onPlay: [{ type: 'draw', amount: 1, target: 'controller' }],
  },

  // ─── WHITE ───

  'Relic Absorbtion': {
    // "Destroy a relic YOU control: gain 5 blood; if you have any bleed, draw 1"
    targets: [{ type: 'ownRelic', label: 'relic to destroy' }],
    onPlay: [
      { type: 'destroy', target: 'target' },
      { type: 'heal', amount: 5, target: 'controller' },
      {
        type: 'ifLastDestroyed',
        then: [
          // "If you have any bleed → draw 1" — approximated as always draw 1 since destroy succeeded
          { type: 'draw', amount: 1, target: 'controller' },
        ],
      },
    ],
  },

  'Echo of Ages': {
    // "Look at top 3, put one in hand, rest on bottom" — simplified: draw 1
    targets: [],
    onPlay: [{ type: 'draw', amount: 1, target: 'controller' }],
  },

  'Dawn Defier': {
    // Card text: "+1 power, Siphon, and Breach until end of turn"
    // Fixed in keyword-patch session.
    targets: [{ type: 'creature', label: 'creature to empower' }],
    onPlay: [
      { type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' },
      { type: 'GRANT_KEYWORD', keyword: 'SIPHON', duration: 'endOfTurn', target: 'target' },
      { type: 'GRANT_KEYWORD', keyword: 'BREACH', duration: 'endOfTurn', target: 'target' },
    ],
  },

  'Ask for Blessings': {
    // Card text: "Target creature gains Tireless and Siphon until end of turn"
    // Fixed in keyword-patch session.
    targets: [{ type: 'creature', label: 'creature to bless' }],
    onPlay: [
      { type: 'GRANT_KEYWORD', keyword: 'TIRELESS', duration: 'endOfTurn', target: 'target' },
      { type: 'GRANT_KEYWORD', keyword: 'SIPHON', duration: 'endOfTurn', target: 'target' },
    ],
  },

  // ─── BLACK ───

  'Shadowstalk Burst': {
    // Card text: "Target creature gains Siphon until end of turn"
    // Fixed in keyword-patch session.
    targets: [{ type: 'creature', label: 'creature to grant siphon' }],
    onPlay: [
      { type: 'GRANT_KEYWORD', keyword: 'SIPHON', duration: 'endOfTurn', target: 'target' },
    ],
  },

  'Wicked Harvest': {
    // Already exists in original — skip
  },

  // ─── PURPLE ───

  'Eternal Subterfuge': {
    // "Remove target creature from game, replaced by Illusion Token"
    // Without token system, we approximate by destroying the creature.
    targets: [{ type: 'creature', label: 'creature to remove' }],
    onPlay: [{ type: 'destroy', target: 'target' }],
  },

  'Mindforge Dominion': {
    // "Gain control of target creature" — control change is complex.
    // Substitute: exhaust target creature (loses use this turn) + buff own creature
    targets: [{ type: 'enemyCreature', label: 'enemy creature to subvert' }],
    onPlay: [
      { type: 'exhaust', target: 'target' },
      // No buff target here since we can't easily target own creature secondarily
    ],
  },

};

// Merge expansion into main effects dict
Object.assign(CARD_EFFECTS, EXPANSION);

// ═══════════ FINAL EXPANSION — remaining spells + many ability cards ═══════════
// Strategy: implement everything reachable with existing effect types.
// Skip with notes: tokens, walls, Glimpse, Pitch, Support, hand peeking, deck search,
// return-from-discard-to-board, blood color management.

const EXPANSION2 = {

  // ═══════════ MORE SPELLS ═══════════

  // RED — Left Behind: "Target player can only block with one creature this turn / Pitch: Draw 1"
  // The "can only block with one creature" is a global combat restriction we'd need to plumb.
  // Approximated: exhaust an enemy creature (removes a blocker) + add 1 bleed.
  'Left Behind': {
    targets: [{ type: 'enemyCreature', label: 'enemy creature to lock down' }],
    onPlay: [
      { type: 'exhaust', target: 'target' },
      { type: 'addBleed', amount: 1, target: 'opponent' },
    ],
  },

  // RED — Demolition Expert: "Power doubled vs wall blocker"
  // Without walls, approximated as +2 power to attacker.
  'Demolition Expert': {
    targets: [{ type: 'creature', label: 'attacking creature' }],
    onPlay: [{ type: 'buff', power: 2, duration: 'endOfTurn', target: 'target' }],
  },

  // BLACK — Swarm Surge: "+2 power; +Bleed +1 if has Bat/Wolf token"
  // No token mechanic; just buff +2.
  'Swarm Surge': {
    targets: [{ type: 'creature', label: 'creature to buff' }],
    onPlay: [{ type: 'buff', power: 2, duration: 'endOfTurn', target: 'target' }],
  },

  // BLACK — Lying in Wait: "Return target creature card from discard into play... removed at EOT"
  // We can't easily put a card from discard back INTO PLAY (slot mgmt + summoning sickness rules).
  // Approximate: return one card from your discard to your hand.
  'Lying in Wait': {
    targets: [],
    onPlay: [{ type: 'returnFromDiscard' }],
  },

  // PURPLE — Surveiling Eye: "Look at hand + Glimpse 1" — hand peek not implemented; draw 1.
  'Surveiling Eye': {
    targets: [],
    onPlay: [{ type: 'draw', amount: 1, target: 'controller' }],
  },

  // PURPLE — Psyche Symposium: "Opp discards 1 OR you Glimpse 2 and draw 1"
  // Player choice between branches not a thing yet; default to: opp random discard 1.
  'Psyche Symposium': {
    targets: [],
    onPlay: [{ type: 'discard', amount: 1, target: 'opponent' }],
  },

  // PURPLE — Etherhand Locator: "Search deck for a card and put on top"
  // Deck search not implemented; approximate as draw 1.
  'Etherhand Locator': {
    targets: [],
    onPlay: [{ type: 'draw', amount: 1, target: 'controller' }],
  },

  // ═══════════ MORE ACTIVATED ABILITIES — CREATURES ═══════════

  // RED — Chrome Fang Berserker: "Exhaust: 2 Bleed to player, Selfbleed 2"
  'Chrome Fang Berserker': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'player', label: 'player to bleed' }],
      effects: [
        { type: 'addBleed', amount: 2, target: 'target' },
        { type: 'addBleed', amount: 2, target: 'controller' }, // selfbleed
      ],
    },
  },

  // RED — Blood Lab Master: "Exhaust: Remove all bleed from target player, they take damage = removed"
  'Blood Lab Master': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'player', label: 'player' }],
      effects: [{ type: 'damageBleedAndClear', target: 'target' }],
    },
  },

  // WHITE — Faithful Healer: "Exhaust: -1 bleed; Overexhaust: -2 bleed"
  // Player chooses which mode by current exhaust state. We support exhaust path here.
  'Faithful Healer': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'player', label: 'player to cleanse' }],
      effects: [{ type: 'removeBleed', amount: 1, target: 'target' }],
    },
  },

  // WHITE — Selene Crystalforge: "Exhaust: +1 power counter on target non-wall creature"
  'Selene Crystalforge': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'creature', label: 'creature to enhance' }],
      effects: [{ type: 'addPowerCounter', amount: 1, target: 'target' }],
    },
  },

  // WHITE — Aristocrat Seer: "Exhaust: Destroy own wall or relic, gain life=cost, draw 1"
  // Approximation: destroy own relic, heal small + draw 1.
  'Aristocrat Seer': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'ownRelic', label: 'relic to sacrifice' }],
      effects: [
        { type: 'destroy', target: 'target' },
        { type: 'heal', amount: 2, target: 'controller' },
        { type: 'draw', amount: 1, target: 'controller' },
      ],
    },
  },

  // WHITE — Count Vladislav Dracul: "WWWW Exhaust: Destroy all creatures except self"
  'Count Vladislav Dracul': {
    activatedAbility: {
      cost: { gold: 4, exhaust: true },
      targets: [],
      effects: [{ type: 'destroyAllCreaturesExceptSelf' }],
    },
  },

  // WHITE — Loyal Butler: "Exhaust+sac: prevent damage from one source"
  // Approximate as: destroy self + heal 2 (damage prevention substitute)
  'Loyal Butler': {
    activatedAbility: {
      cost: { exhaust: true, sacrificeSelf: true },
      targets: [],
      effects: [{ type: 'heal', amount: 2, target: 'controller' }],
    },
  },

  // WHITE — Vault Keeper: "Exhaust: reveal top card; if relic, put in hand; else top of deck"
  // No deck-peek UI; approximate as draw 1.
  'Vault Keeper': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [],
      effects: [{ type: 'draw', amount: 1, target: 'controller' }],
    },
  },

  // PURPLE — Mystic Alchemist: "Exhaust: Target creature gets -1 power until end of turn"
  'Mystic Alchemist': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'creature', label: 'creature to weaken' }],
      effects: [{ type: 'buff', power: -1, duration: 'endOfTurn', target: 'target' }],
    },
  },

  // PURPLE — Arcane Petalwhipser: "Exhaust: Give -1 power to 2 target creatures until end of turn"
  'Arcane Petalwhipser': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [
        { type: 'creature', label: 'first creature to weaken' },
        { type: 'creature', label: 'second creature to weaken', optional: true },
      ],
      effects: [
        { type: 'buff', power: -1, duration: 'endOfTurn', target: 'target' },
        { type: 'buff', power: -1, duration: 'endOfTurn', target: 'target2', skipIfMissing: true },
      ],
    },
  },

  // PURPLE — Mystic Trapper: "Exhaust: Exhaust target creature"
  'Mystic Trapper': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'creature', label: 'creature to exhaust' }],
      effects: [{ type: 'exhaust', target: 'target' }],
    },
  },

  // BLACK — Korzathrax, Marrow Sovereign:
  // "{B}{B}{B} Overexhaust: Return one creature card from discard to hand"
  // Blood cost approximated as gold cost (blood-color ability costs not yet supported).
  'Korzathrax, Marrow Sovereign': {
    activatedAbility: {
      cost: { gold: 3, overexhaust: true },
      targets: [],
      effects: [{ type: 'returnFromDiscard' }],
      oncePerTurn: true,
    },
  },

  // PURPLE — Quantum Oracle:
  // "Exhaust: Destroy target relic you control, draw 1 and reveal; if relic, may play free"
  // Free-play-on-relic not supported; approximated as destroy own relic + draw 1.
  'Quantum Oracle': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'ownRelic', label: 'relic to sacrifice' }],
      effects: [
        { type: 'destroy', target: 'target' },
        { type: 'draw', amount: 1, target: 'controller' },
      ],
    },
  },

  // BLACK — Dusk Warrior: "Sac: Create 1 Bat Token"
  // No tokens — skip until token system exists. (Excluded from CARD_EFFECTS.)

  // ═══════════ MORE ACTIVATED ABILITIES — RELICS ═══════════

  // RED — Blood Vial Toolbelt: "Selfbleed 1. Exhaust: target creature gains Bleed +1 EOT"
  // Fixed: grants real BLEED:1 keyword.
  'Blood Vial Toolbelt': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'creature', label: 'creature to mark with Bleed +1' }],
      effects: [{ type: 'GRANT_KEYWORD', keyword: 'BLEED:1', duration: 'endOfTurn', target: 'target' }],
    },
  },

  // BLACK — Koru Boneshard: "Exhaust + sac own token: 1 damage anywhere"
  // No tokens; approximated as: exhaust (cost), 1 damage to any target.
  'Koru Boneshard': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'creatureOrPlayer', label: 'damage target' }],
      effects: [{ type: 'damage', amount: 1, target: 'target' }],
    },
  },

  // PURPLE — Nexus of Veils: "PP Overexhaust: overexhaust target creature"
  'Nexus of Veils': {
    activatedAbility: {
      cost: { gold: 2, overexhaust: true },
      targets: [{ type: 'creature', label: 'creature to overexhaust' }],
      effects: [{ type: 'overexhaust', target: 'target' }],
    },
  },

  // PURPLE — Augur's Signet: "Exhaust: target creature with Glimpse +1 power EOT"
  // No Glimpse; just buff any creature.
  "Augur's Signet": {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'creature', label: 'creature to buff' }],
      effects: [{ type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' }],
    },
  },

  // COLORLESS — Dawnscribe Codex: "CCC Exhaust: Draw 1"
  'Dawnscribe Codex': {
    activatedAbility: {
      cost: { gold: 3, exhaust: true },
      targets: [],
      effects: [{ type: 'draw', amount: 1, target: 'controller' }],
    },
  },

  // COLORLESS — Hemostasis Recounter: "CC Exhaust: -1 bleed on target player"
  'Hemostasis Recounter': {
    activatedAbility: {
      cost: { gold: 2, exhaust: true },
      targets: [{ type: 'player', label: 'player' }],
      effects: [{ type: 'removeBleed', amount: 1, target: 'target' }],
    },
  },

  // COLORLESS — Vein Tap: "Exhaust: -1 bleed on target player"
  'Vein Tap': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'player', label: 'player' }],
      effects: [{ type: 'removeBleed', amount: 1, target: 'target' }],
    },
  },

  // COLORLESS — Bloodletter Ring: "C Exhaust: Target gains Siphon EOT"
  // Fixed: grants real SIPHON keyword.
  'Bloodletter Ring': {
    activatedAbility: {
      cost: { gold: 1, exhaust: true },
      targets: [{ type: 'creature', label: 'creature to grant siphon' }],
      effects: [{ type: 'GRANT_KEYWORD', keyword: 'SIPHON', duration: 'endOfTurn', target: 'target' }],
    },
  },

  // COLORLESS — Technae Core Glasses: "C Exhaust: target creature Bleed +1 EOT"
  // Fixed.
  'Technae Core Glasses': {
    activatedAbility: {
      cost: { gold: 1, exhaust: true },
      targets: [{ type: 'creature', label: 'creature to mark with Bleed +1' }],
      effects: [{ type: 'GRANT_KEYWORD', keyword: 'BLEED:1', duration: 'endOfTurn', target: 'target' }],
    },
  },

  // COLORLESS — Gun Store: "Exhaust: attacking creature with power≤2 gets +1 EOT"
  'Gun Store': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'creature', label: 'attacking creature' }],
      effects: [{ type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' }],
    },
  },

  // COLORLESS — Pop-Up Veinmart: "Overexhaust: +1 blood point"
  'Pop-Up Veinmart': {
    activatedAbility: {
      cost: { overexhaust: true },
      targets: [],
      effects: [{ type: 'heal', amount: 1, target: 'controller' }],
    },
  },

  // COLORLESS — Solace-12: "Enters exhausted. Exhaust: destroy self, target creature unblockable EOT"
  'Solace-12': {
    activatedAbility: {
      cost: { exhaust: true, sacrificeSelf: true },
      targets: [{ type: 'creature', label: 'creature to make unblockable' }],
      effects: [{ type: 'flagCantBeBlocked', target: 'target' }],
    },
  },

  // COLORLESS — Spirelight Harness: "Exhaust: target creature gains Tireless EOT"
  // Fixed.
  'Spirelight Harness': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'creature', label: 'creature to grant tireless' }],
      effects: [{ type: 'GRANT_KEYWORD', keyword: 'TIRELESS', duration: 'endOfTurn', target: 'target' }],
    },
  },

  // COLORLESS — Scavenger Bot: "Exhaust: Destroy own relic, gain blood = its cost"
  // Approximation: destroy own relic + heal 2 (we don't track per-card cost easily here)
  'Scavenger Bot': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'ownRelic', label: 'relic to sacrifice' }],
      effects: [
        { type: 'destroy', target: 'target' },
        { type: 'heal', amount: 2, target: 'controller' },
      ],
    },
  },

  // COLORLESS — Equilibrium Pulse: "CCCC Exhaust: destroy self + destroy ALL creatures"
  'Equilibrium Pulse': {
    activatedAbility: {
      cost: { gold: 4, exhaust: true, sacrificeSelf: true },
      targets: [],
      effects: [{ type: 'destroyAllCreatures' }],
    },
  },

  // COLORLESS — Chronal Spire: "Exhaust: destroy self, lose half blood, take extra turn"
  // Extra-turn is huge to implement; approximate as: destroy self, heal nothing, draw 1.
  'Chronal Spire': {
    activatedAbility: {
      cost: { exhaust: true, sacrificeSelf: true },
      targets: [],
      effects: [{ type: 'draw', amount: 1, target: 'controller' }],
    },
  },

  // COLORLESS — Loyalty Badge: "Exhaust: Exhaust own creature, add 1 Blood any color"
  // Blood-color management → approximate as +1 gold.
  'Loyalty Badge': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'ownCreature', label: 'creature to exhaust' }],
      effects: [
        { type: 'exhaust', target: 'target' },
        { type: 'gainGold', amount: 1 },
      ],
    },
  },

  // ═══════════ SKIPPED — require new mechanics ═══════════
  //
  // Token mechanic needed:
  //   Spells:   Dark Reach, Siphon Life, Grave Reanimation (×2), Verdigris Husk,
  //             Fodder's Bequest, Binding of the Damned, Aether Copy
  //   Relics:   Grimfang Lair, Sanguine Batspring, Necrotic Battery, Soulforge Anvil
  //   Creatures: Dusk Warrior (Sac: token), most "create token" abilities
  //
  // Wall mechanic needed:
  //   Spells:   Palace Decree, Ancient Reclamation
  //   Creatures: Relic Guardian, Estate Grounds Keeper, Crystal Ward Guardian
  //
  // Glimpse mechanic needed:
  //   Spells:   Void Classroom Echo
  //   Relics:   Astral Archive, Prophecy Foretold, Drone Scanner
  //
  // Pitch alt-cost needed:
  //   Most cards with "Pitch:" text (we only handle their non-pitch effect)
  //
  // Support / Tireless / Siphon keywords needed:
  //   Spells:   Alchemical Infusion
  //   Many creatures with these keywords still play as plain creatures
  //
  // Hand peek needed:
  //   Creatures: Perch Watcher
  //
  // Deck search needed:
  //   Spells:   Etherhand Locator (approximated as draw)
  //
  // Control change needed (gain control of enemy creature):
  //   Creatures: Hypeflux Ghostjacker, Relic Hoarder
  //
  // Blood-color management needed:
  //   Relics:   Muckmouth Bauble, Obsidian Resonance Tower, Vein-to-Vault Mobile,
  //             Blood Vending Machine, Eternal Archive, Echo Reliquary, Key to the Last Page

};

Object.assign(CARD_EFFECTS, EXPANSION2);

export function getCardEffects(card) {
  if (!card || !card.name) return null;
  return CARD_EFFECTS[card.name] || null;
}

export function hasActivatedAbility(card) {
  const e = getCardEffects(card);
  return !!(e && e.activatedAbility);
}

export function isSpellSupported(card) {
  const e = getCardEffects(card);
  return !!(e && e.onPlay);
}

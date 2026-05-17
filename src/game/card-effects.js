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

import { G } from './state.js';
import { hasKeyword, grantKeyword } from './keywords.js';
import { sacrificeCreature } from './sacrifice.js';
import { sacrificeRelic } from './relics.js';

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
    // "Destroy any token under your control to give +3 power to target creature until end of turn"
    targets: [
      { type: 'ownCreature', label: 'own creature to sacrifice token from',
        filter: (t) => t.kind === 'creature' && (t._inst?.tokens?.length || 0) > 0 },
      { type: 'creature', label: 'creature to buff' },
    ],
    onPlay: [
      { type: 'destroyToken', tokenType: 'any', target: 'target' },
      { type: 'buff', power: 3, duration: 'endOfTurn', target: 'target2' },
    ],
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
  'Swarm Surge': {
    targets: [{ type: 'creature', label: 'creature to buff' }],
    onPlay: [
      { type: 'buff', power: 2, duration: 'endOfTurn', target: 'target' },
      {
        type: 'GRANT_KEYWORD', keyword: 'BLEED:1', duration: 'endOfTurn', target: 'target',
        onlyIf: (ctx) => {
          const t = (ctx.targets || [])[0];
          if (!t || t.kind !== 'creature') return false;
          const c = G[t.side]?.creatures?.[t.slotIdx];
          return (c?.tokens || []).some(tok => tok === 'Bat' || tok === 'Wolf');
        },
      },
    ],
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

  // ═══════════ SKIPPED — still require new mechanics ═══════════
  //
  // Wall mechanic needed:
  //   Spells:   Palace Decree, Ancient Reclamation
  //   Creatures: Relic Guardian, Estate Grounds Keeper, Crystal Ward Guardian
  //
  // Pitch alt-cost needed:
  //   Most cards with "Pitch:" text (we only handle their non-pitch effect)
  //
  // Complex token cards (conditional/passive effects):
  //   Bogveil Packwitch, Lupine Countess passive, Hornshadow Stringlord, Fenlily Seraphine,
  //   Runefang Wardrum, Fodder's Bequest, Aether Copy, Soulforge Anvil
  //
  // Triggered abilities (ON_DEATH, ON_ATTACK, ON_DIRECT_DAMAGE):
  //   Valthor ON_DEATH, Werewolf Shaman ON_DIRECT_DAMAGE,
  //   Lyssara ON_KILL, Rothollow ON_DIRECT_DAMAGE,
  //   Lunara Prismwing ON_DIRECT_DAMAGE, Archsage Alaris Vox ON_DIRECT_DAMAGE
  //
  // Hand peek / Deck search needed:
  //   Perch Watcher, Etherhand Locator (approximated as draw)
  //
  // Control change: Hypeflux Ghostjacker, Relic Hoarder
  //
  // Blood-color management:
  //   Muckmouth Bauble, Obsidian Resonance Tower, Vein-to-Vault Mobile,
  //   Blood Vending Machine, Eternal Archive, Echo Reliquary, Key to the Last Page

};

Object.assign(CARD_EFFECTS, EXPANSION2);

// ═══════════ EXPANSION3 — Token system + Glimpse mechanic ═══════════

const EXPANSION3 = {

  // ─── TOKEN SPELLS ───

  // BLACK — Dark Reach: "Create a Raven token on target creature"
  // Pitch: Target takes 1 damage, gain 1 blood (pitch not yet implemented)
  'Dark Reach': {
    targets: [{ type: 'ownCreature', label: 'creature to receive Raven token' }],
    onPlay: [{ type: 'createToken', tokenType: 'Raven', target: 'target' }],
  },

  // BLACK — Siphon Life: "Destroy a Bat token, gain 1 life, create 2 Bat tokens"
  'Siphon Life': {
    targets: [{
      type: 'ownCreature', label: 'creature with Bat token',
      filter: (t) => t.kind === 'creature' && (t._inst?.tokens || []).includes('Bat'),
    }],
    onPlay: [
      { type: 'destroyToken', tokenType: 'Bat', target: 'target' },
      { type: 'heal', amount: 1, target: 'controller' },
      { type: 'createToken', tokenType: 'Bat', amount: 2, target: 'target' },
    ],
  },

  // BLACK — Grave Reanimation: "Create 1 Wolf token"
  // Conditional (if already have wolf token, grant Haste+Tireless) not implemented
  'Grave Reanimation': {
    targets: [{ type: 'ownCreature', label: 'creature to receive Wolf token' }],
    onPlay: [{ type: 'createToken', tokenType: 'Wolf', target: 'target' }],
  },

  // BLACK — Verdigris Husk: "Exhaust target relic, create 1 Zombie token"
  'Verdigris Husk': {
    targets: [
      { type: 'relic', label: 'relic to exhaust' },
      { type: 'ownCreature', label: 'creature to receive Zombie token' },
    ],
    onPlay: [
      { type: 'exhaust', target: 'target' },
      { type: 'createToken', tokenType: 'Zombie', target: 'target2' },
    ],
  },

  // BLACK — Binding of the Damned: "Destroy own token, exhaust target creature"
  'Binding of the Damned': {
    targets: [
      { type: 'ownCreature', label: 'own creature to remove token from',
        filter: (t) => t.kind === 'creature' && (t._inst?.tokens?.length || 0) > 0 },
      { type: 'creature', label: 'creature to exhaust' },
    ],
    onPlay: [
      { type: 'destroyToken', tokenType: 'any', target: 'target' },
      { type: 'exhaust', target: 'target2' },
    ],
  },

  // ─── TOKEN CREATURE ONPLAY EFFECTS ───

  // BLACK — Ebonwing Matriarch: "Selfbleed 1, enters with 1 Bat token"
  'Ebonwing Matriarch': {
    onPlay: [{ type: 'createToken', tokenType: 'Bat', host: 'self' }],
  },

  // COLORLESS — Dr. Elias Crowe: "Siphon, enters with 1 Bat token and 2 Raven tokens.
  //   Sac a token orbiting this creature to gain +1 power"
  'Dr. Elias Crowe': {
    onPlay: [
      { type: 'createToken', tokenType: 'Bat', host: 'self' },
      { type: 'createToken', tokenType: 'Raven', amount: 2, host: 'self' },
    ],
    activatedAbility: {
      cost: {},
      targets: [],
      effects: [
        { type: 'destroyToken', tokenType: 'any', host: 'self' },
        { type: 'addPowerCounter', amount: 1, target: 'self' },
      ],
      oncePerTurn: false,
    },
  },

  // ─── TOKEN CREATURE ACTIVATED ABILITIES ───

  // BLACK — Dusk Warrior: "Sac self: Create 1 Bat Token on target own creature"
  'Dusk Warrior': {
    activatedAbility: {
      cost: { sacrificeSelf: true },
      targets: [{ type: 'ownCreature', label: 'creature to receive Bat token' }],
      effects: [{ type: 'createToken', tokenType: 'Bat', target: 'target' }],
    },
  },

  // BLACK — Gravehorde Hierophant: "Selfbleed 1. Exhaust: Create 1 Zombie token"
  'Gravehorde Hierophant': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [],
      effects: [{ type: 'createToken', tokenType: 'Zombie', host: 'self' }],
    },
  },

  // BLACK — Grimbeak Summoner: "Exhaust: Create 1 Raven token"
  'Grimbeak Summoner': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [],
      effects: [{ type: 'createToken', tokenType: 'Raven', host: 'self' }],
    },
  },

  // BLACK — Swarmshade Witch: "Exhaust: Create 1 Raven token"
  // "If any tokens are destroyed, destroy this creature" — triggered, skipped
  'Swarmshade Witch': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [],
      effects: [{ type: 'createToken', tokenType: 'Raven', host: 'self' }],
    },
  },

  // BLACK — Shadowpack Mistress: "Selfbleed 1, Bleed 1. {B}{Exhaust}: Create 1 Wolf token"
  // {B} blood cost approximated as gold: 1
  'Shadowpack Mistress': {
    activatedAbility: {
      cost: { gold: 1, exhaust: true },
      targets: [],
      effects: [{ type: 'createToken', tokenType: 'Wolf', host: 'self' }],
    },
  },

  // BLACK — Werewolf Hierophant: "{B}{B}{B}{B}{Exhaust}: Create 2 Wolf tokens"
  // Blood cost approximated as gold: 4. Second ability (overexhaust) not modeled.
  'Werewolf Hierophant': {
    activatedAbility: {
      cost: { gold: 4, exhaust: true },
      targets: [],
      effects: [{ type: 'createToken', tokenType: 'Wolf', amount: 2, host: 'self' }],
    },
  },

  // ─── TOKEN RELIC ACTIVATED ABILITIES ───

  // BLACK — Sanguine Batspring: "{B}{Overexhaust}: Create 1 Bat token on target own creature"
  // Blood cost approximated as gold: 1
  'Sanguine Batspring': {
    activatedAbility: {
      cost: { gold: 1, overexhaust: true },
      targets: [{ type: 'ownCreature', label: 'creature to receive Bat token' }],
      effects: [{ type: 'createToken', tokenType: 'Bat', target: 'target' }],
    },
  },

  // BLACK — Grimfang Lair: "{B}{B}{Overexhaust}: Create 1 Wolf token on target own creature"
  // Blood cost approximated as gold: 2
  'Grimfang Lair': {
    activatedAbility: {
      cost: { gold: 2, overexhaust: true },
      targets: [{ type: 'ownCreature', label: 'creature to receive Wolf token' }],
      effects: [{ type: 'createToken', tokenType: 'Wolf', target: 'target' }],
    },
  },

  // COLORLESS — Necrotic Battery: "{C}{C}{C}{Exhaust}: Create 1 Zombie token on target own creature"
  'Necrotic Battery': {
    activatedAbility: {
      cost: { gold: 3, exhaust: true },
      targets: [{ type: 'ownCreature', label: 'creature to receive Zombie token' }],
      effects: [{ type: 'createToken', tokenType: 'Zombie', target: 'target' }],
    },
  },

  // ─── GLIMPSE SPELLS ───

  // PURPLE — Void Classroom Echo: "Glimpse 2"
  'Void Classroom Echo': {
    targets: [],
    onPlay: [{ type: 'glimpse', amount: 2 }],
  },

  // PURPLE — Psychic Shard: "Deal 1 damage then Glimpse 1" (replaces draw 1 placeholder)
  // Already in CARD_EFFECTS — override via EXPANSION3 merge
  'Psychic Shard': {
    targets: [{ type: 'creatureOrPlayer', label: 'damage target' }],
    onPlay: [
      { type: 'damage', amount: 1, target: 'target' },
      { type: 'glimpse', amount: 1 },
    ],
  },

  // PURPLE — Surveiling Eye: "Look at target player's hand then Glimpse 1"
  // Hand peek not implemented; just Glimpse 1
  'Surveiling Eye': {
    targets: [],
    onPlay: [{ type: 'glimpse', amount: 1 }],
  },

  // PURPLE — Veilcataclysm: "Glimpse 3 then draw a card"
  'Veilcataclysm': {
    targets: [],
    onPlay: [
      { type: 'glimpse', amount: 3 },
      { type: 'draw', amount: 1, target: 'controller' },
    ],
  },

  // PURPLE — Focused Clairvoyance: "Glimpse 5, then draw 1"
  'Focused Clairvoyance': {
    targets: [],
    onPlay: [
      { type: 'glimpse', amount: 5 },
      { type: 'draw', amount: 1, target: 'controller' },
    ],
  },

  // ─── GLIMPSE CREATURE ACTIVATED ABILITIES ───

  // PURPLE — Arcane Scholar Acolyte: "{P}: Glimpse 1 (once per turn)"
  // Blood cost approximated as gold: 1
  'Arcane Scholar Acolyte': {
    activatedAbility: {
      cost: { gold: 1 },
      targets: [],
      effects: [{ type: 'glimpse', amount: 1 }],
      oncePerTurn: true,
    },
  },

  // PURPLE — Dustveil Prospector: "{P}{Exhaust}: Glimpse 1"
  // "If relic, reveal and put in hand" — that's the Glimpse pick behavior, handled by auto-pick
  'Dustveil Prospector': {
    activatedAbility: {
      cost: { gold: 1, exhaust: true },
      targets: [],
      effects: [{ type: 'glimpse', amount: 1 }],
    },
  },

  // PURPLE — Aetheric Diviner: "{P}{P}{P}{Overexhaust}: Glimpse 3, draw 1"
  // Blood cost approximated as gold: 3
  'Aetheric Diviner': {
    activatedAbility: {
      cost: { gold: 3, overexhaust: true },
      targets: [],
      effects: [
        { type: 'glimpse', amount: 3 },
        { type: 'draw', amount: 1, target: 'controller' },
      ],
    },
  },

  // PURPLE — Akane Chishiki: "When this card enters play, Glimpse 2"
  // (Has Bleed 2, Breach, Haste, Siphon, Tireless via keywords)
  'Akane Chishiki': {
    onPlay: [{ type: 'glimpse', amount: 2 }],
  },

  // ─── GLIMPSE RELIC ACTIVATED ABILITIES ───

  // PURPLE — Astral Archive: "Exhaust: Reverse Glimpse 2"
  // Reverse Glimpse (bottom-of-deck to top) is niche; approximated as standard Glimpse 2
  'Astral Archive': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [],
      effects: [{ type: 'glimpse', amount: 2 }],
    },
  },

  // PURPLE — Prophecy Foretold: "Exhaust: Glimpse X where X = number of relics you control"
  'Prophecy Foretold': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [],
      effects: [{ type: 'glimpse', amountFrom: 'ownRelicCount' }],
    },
  },

  // COLORLESS — Drone Scanner: "{C}{Exhaust}: Glimpse 1"
  'Drone Scanner': {
    activatedAbility: {
      cost: { gold: 1, exhaust: true },
      targets: [],
      effects: [{ type: 'glimpse', amount: 1 }],
    },
  },

};

Object.assign(CARD_EFFECTS, EXPANSION3);

// ═══════════ EXPANSION4 — Triggered abilities, passives, remaining cards ═══════════

const EXPANSION4 = {

  // ─── ON_DEATH TRIGGERS ───

  // BLACK — Valthor, the Eternal Cadaver: "When this creature is destroyed, create 2 Zombie tokens"
  // Tokens orbit the first available other friendly creature (§9.2 requires a host)
  'Valthor, the Eternal Cadaver': {
    onDeath: [
      { type: 'createToken', tokenType: 'Zombie', amount: 2, host: 'firstOwnCreature' },
    ],
  },

  // WHITE — Heir Apparent's Aide: "When this card is destroyed, its controller gains 1 blood"
  'Heir Apparent\'s Aide': {
    onDeath: [
      { type: 'heal', amount: 1, target: 'controller' },
    ],
  },

  // ─── ON_KILL TRIGGERS ───

  // BLACK — Lyssara, Witch of the Apex: "When this creature destroys another creature,
  //   create 1 Bat, 1 Wolf, and 1 Zombie token under your control"
  'Lyssara, Witch of the Apex': {
    onKill: [
      { type: 'createToken', tokenType: 'Bat', host: 'self' },
      { type: 'createToken', tokenType: 'Wolf', host: 'self' },
      { type: 'createToken', tokenType: 'Zombie', host: 'self' },
    ],
  },

  // ─── ON_DIRECT_DAMAGE TRIGGERS ───

  // BLACK — Werewolf Shaman: "Bleed 1; If this creature inflicts Bleed, attach a Wolf token"
  // Fires when it deals direct damage (BLEED keyword means it always inflicts bleed on direct hits)
  'Werewolf Shaman': {
    onDirectDamage: [
      { type: 'createToken', tokenType: 'Wolf', host: 'self' },
    ],
  },

  // BLACK — Rothollow Packmaster: "Bleed 1, Hemorrhage: When this deals direct damage, create 1 Wolf token"
  'Rothollow Packmaster': {
    onDirectDamage: [
      { type: 'createToken', tokenType: 'Wolf', host: 'self' },
    ],
  },

  // PURPLE — Grimoire Scribe: "If this creature deals combat damage directly to a player,
  //   they must overexhaust a card they control"
  'Grimoire Scribe': {
    onDirectDamage: [
      { type: 'overexhaustOneCard' }, // targets opponent (default)
    ],
  },

  // PURPLE — Archsage Alaris Vox: "Breach, Whenever this deals damage directly, Glimpse 2"
  // (Drawing spell cards from glimpse is not tracked; just Glimpse 2)
  'Archsage Alaris Vox': {
    onDirectDamage: [
      { type: 'glimpse', amount: 2 },
    ],
  },

  // PURPLE — Lunara Prismwing: "Cannot be blocked. Whenever this deals damage directly, Glimpse 1"
  'Lunara Prismwing': {
    onDirectDamage: [
      { type: 'glimpse', amount: 1 },
    ],
  },

  // RED — Veinstorm Detonator: "Selfbleed 1, Breach, Bleed 2,
  //   Hemorrhage: When this deals direct damage, deal damage = bleed count on you to target creature"
  // Approximation: on direct damage, deal bleedPool damage to random enemy creature
  'Veinstorm Detonator': {
    onDirectDamage: [
      {
        type: 'custom',
        fn: (ctx) => {
          const side = ctx.sourceSide;
          const oppSide = side === 'player' ? 'ai' : 'player';
          const bleed = G[side]?.bleedPool || 0;
          if (bleed <= 0) return false;
          const targets = (G[oppSide]?.creatures || []).filter(c => c);
          if (targets.length === 0) return false;
          const target = targets[Math.floor(Math.random() * targets.length)];
          target._damageTaken = (target._damageTaken || 0) + bleed;
          return true;
        },
      },
    ],
  },

  // ─── MISSING ACTIVATED ABILITIES ───

  // BLACK — Lupine Countess: "{B}{B}{Exhaust}: Create 2 Wolf tokens"
  // Passive (Wolf tokens gain Bleed 1) is handled in combat.js dealDirectDamageToPlayer
  'Lupine Countess': {
    activatedAbility: {
      cost: { gold: 2, exhaust: true },
      targets: [],
      effects: [
        { type: 'createToken', tokenType: 'Wolf', amount: 2, host: 'self' },
      ],
    },
  },

  // BLACK — Nyxara Boneweaver: two exhaust abilities; implement token-sac path
  // "{Exhaust}: Destroy target token you control to add {B}{B}" → heal 2
  'Nyxara Boneweaver': {
    activatedAbility: {
      cost: { exhaust: true, sacrificeToken: 'any' },
      targets: [],
      effects: [{ type: 'heal', amount: 2, target: 'controller' }],
    },
  },

  // WHITE — Luminara Boneweaver: "{B}{B}{Exhaust}: Destroy target token to add {G}{G}"
  // → gain 2 gold
  'Luminara Boneweaver': {
    activatedAbility: {
      cost: { gold: 2, exhaust: true, sacrificeToken: 'any' },
      targets: [],
      effects: [{ type: 'gainGold', amount: 2 }],
    },
  },

  // PURPLE — Aetheric Archivist: "{P}: Glimpse 2 (once per turn)"
  'Aetheric Archivist': {
    activatedAbility: {
      cost: { gold: 1 },
      targets: [],
      effects: [{ type: 'glimpse', amount: 2 }],
      oncePerTurn: true,
    },
  },

  // PURPLE — Runed Pageweaver: "{P}{Exhaust}: Shuffle card from discard into deck, gain 1 if spell"
  // "Shuffle" → approximate as returnFromDiscard (to hand) + heal 1
  'Runed Pageweaver': {
    activatedAbility: {
      cost: { gold: 1, exhaust: true },
      targets: [],
      effects: [
        { type: 'returnFromDiscard' },
        { type: 'heal', amount: 1, target: 'controller' },
      ],
    },
  },

  // BLACK — Dr. Elias Crowe: update to use proper sacrificeToken cost
  // Override EXPANSION3 entry
  'Dr. Elias Crowe': {
    onPlay: [
      { type: 'createToken', tokenType: 'Bat', host: 'self' },
      { type: 'createToken', tokenType: 'Raven', amount: 2, host: 'self' },
    ],
    activatedAbility: {
      cost: { sacrificeToken: 'any' },
      targets: [],
      effects: [
        { type: 'addPowerCounter', amount: 1, target: 'self' },
      ],
    },
  },

  // BLACK — Koru Boneshard (relic): update to use proper sacrificeToken cost
  'Koru Boneshard': {
    activatedAbility: {
      cost: { exhaust: true, sacrificeToken: 'any' },
      targets: [{ type: 'creatureOrPlayer', label: 'damage target' }],
      effects: [{ type: 'damage', amount: 1, target: 'target' }],
    },
  },

  // BLACK — Runefang Wardrum (relic): "{Exhaust}: Target creature with Wolf tokens gets +1 power EOT"
  // Targets a creature that has Wolf tokens
  'Runefang Wardrum': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{
        type: 'creature', label: 'creature with Wolf token',
        filter: (t) => t.kind === 'creature' && (t._inst?.tokens || []).includes('Wolf'),
      }],
      effects: [{ type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' }],
    },
  },

  // ─── MISSING GLIMPSE CREATURES ───

  // PURPLE — Aetheric Archivist already added above.

  // ─── REMAINING CARDS WITH ACTIVATED ABILITIES ───

  // WHITE — Faithful Healer: two modes; add overexhaust path (separate from exhaust path)
  // Overexhaust path removes 2 bleed. We currently only have the exhaust path (remove 1).
  // Overexhaust path is a different activated ability — approximated by overriding with
  // the stronger ability (cost: overexhaust → remove 2 bleed, which requires being exhausted first)
  // Keep existing exhaust entry; can't model both in one slot.

  // WHITE — Glitch Tech Goggles: "{R}{R}Exhaust: +2 power, blocker not destroyed by combat damage"
  // "Blocker not destroyed" is hard; we approximate as just +2 power (already in CARD_EFFECTS)
  // No update needed.

  // COLORLESS — Vein-to-Vault Mobile (relic): "{C}{Exhaust}: Add {G}" → gain 1 gold
  'Vein-to-Vault Mobile': {
    activatedAbility: {
      cost: { gold: 1, exhaust: true },
      targets: [],
      effects: [{ type: 'gainGold', amount: 1 }],
    },
  },

  // ─── SKIPPED — STILL REQUIRE NEW MECHANICS ───
  //
  // Gain-control:  Hypeflux Ghostjacker, Relic Hoarder
  // Extra turn:    Chronal Spire
  // Blood-color:   Obsidian Resonance Tower, Blood Vending Machine, Eternal Archive,
  //                Key to the Last Page, Echo Reliquary, Nyxara/Luminara first ability
  // Complex wall:  Estate Grounds Keeper, Crystal Ward Guardian, Living Wall, Relic Guardian
  // Fenlily:       Zombie token gets activated ability (tokens can't have abilities in this model)
  // Bogveil:       Wolf token buff (tokens aren't separate objects)
  // Swarmshade:    On-token-destroyed self-destruct trigger
  // Mira Hermes:   Death-replacement trigger
  // Slashfang:     ON_BLOCK permanent bleed gain
  // Marble Sentinel: EOT power counter (no EOT trigger)
  // Isolde:        On-attack exhaust 2 enemy creatures (needs targeting during combat)
  // Elias Veyr:    Damage reduction + on-spell-targeted trigger
  // Zane Zyra Whetforge: handled in combat.js (no card-effects entry needed)
  // Salizer Shade, Elowen: handled in combat.js

};

Object.assign(CARD_EFFECTS, EXPANSION4);

// ═══════════ EXPANSION5 — gain-control, Living Wall, Bogveil, remaining relics ═══════════

const EXPANSION5 = {

  // PURPLE — Hypeflux Ghostjacker: "Overexhaust: Gain control of target enemy creature with power ≤3"
  'Hypeflux Ghostjacker': {
    activatedAbility: {
      cost: { overexhaust: true },
      targets: [{
        type: 'enemyCreature', label: 'enemy creature to control (power ≤3)',
        filter: (t) => t.kind === 'creature' && (t._inst?.basePower || 0) <= 3,
      }],
      effects: [{ type: 'gainControl', target: 'target' }],
    },
  },

  // RED — Relic Hoarder: "Exhaust: Exhaust target enemy relic"
  'Relic Hoarder': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'enemyRelic', label: 'enemy relic to exhaust' }],
      effects: [{ type: 'exhaust', target: 'target' }],
    },
  },

  // COLORLESS — Obsidian Resonance Tower (relic): "Overexhaust: Gain 2 gold"
  'Obsidian Resonance Tower': {
    activatedAbility: {
      cost: { overexhaust: true },
      targets: [],
      effects: [{ type: 'gainGold', amount: 2 }],
    },
  },

  // COLORLESS — Blood Vending Machine (relic): "C Exhaust: Gain 1 blood"
  'Blood Vending Machine': {
    activatedAbility: {
      cost: { gold: 1, exhaust: true },
      targets: [],
      effects: [{ type: 'heal', amount: 1, target: 'controller' }],
    },
  },

  // COLORLESS — Eternal Archive (relic): "C Overexhaust: Gain 1 gold"
  'Eternal Archive': {
    activatedAbility: {
      cost: { gold: 1, overexhaust: true },
      targets: [],
      effects: [{ type: 'gainGold', amount: 1 }],
    },
  },

  // PURPLE — Key to the Last Page (relic): "Exhaust: Gain 3 gold (approx. free purple card)"
  'Key to the Last Page': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [],
      effects: [{ type: 'gainGold', amount: 3 }],
    },
  },

  // PURPLE — Echo Reliquary (relic): "PP Exhaust: Glimpse 1"
  'Echo Reliquary': {
    activatedAbility: {
      cost: { gold: 2, exhaust: true },
      targets: [],
      effects: [{ type: 'glimpse', amount: 1 }],
    },
  },

  // WHITE — Living Wall (creature/wall):
  // "Exhaust + sacrifice own relic: gains Breach until end of turn"
  'Living Wall': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'ownRelic', label: 'relic to sacrifice' }],
      effects: [
        { type: 'destroy', target: 'target' },
        { type: 'GRANT_KEYWORD', keyword: 'BREACH', duration: 'endOfTurn', target: 'self' },
      ],
    },
  },

  // WHITE — Relic Guardian (creature): "Exhaust + sacrifice self: renew target relic"
  'Relic Guardian': {
    activatedAbility: {
      cost: { exhaust: true, sacrificeSelf: true },
      targets: [{ type: 'ownRelic', label: 'relic to renew' }],
      effects: [{ type: 'renew', target: 'target' }],
    },
  },

  // BLACK — Bogveil Packwitch: "Exhaust: Each creature you control with a Wolf token
  //   gains Siphon and Bleed +1 until end of turn"
  'Bogveil Packwitch': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [],
      effects: [{
        type: 'custom',
        fn: (ctx) => {
          const side = ctx.sourceSide;
          let any = false;
          for (const c of (G[side]?.creatures || [])) {
            if (!c || !(c.tokens || []).includes('Wolf')) continue;
            grantKeyword(c, 'SIPHON', 'endOfTurn');
            grantKeyword(c, 'BLEED:1', 'endOfTurn');
            any = true;
          }
          return any;
        },
      }],
    },
  },

  // WHITE — Estate Grounds Keeper: "Exhaust: Target wall gets +2 power EOT; you gain 2 blood"
  'Estate Grounds Keeper': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{
        type: 'ownCreature', label: 'wall to buff',
        filter: (t) => t.kind === 'creature' && hasKeyword(t._inst, 'WALL'),
      }],
      effects: [
        { type: 'buff', power: 2, duration: 'endOfTurn', target: 'target' },
        { type: 'heal', amount: 2, target: 'controller' },
      ],
    },
  },

  // BLACK — Mira Hermes: death-replacement handled inline in triggers.js (no activatedAbility)
  // Entry is a no-op marker so hasActivatedAbility returns false for her.

};

Object.assign(CARD_EFFECTS, EXPANSION5);

// ═══════════ EXPANSION6 — accurate implementations for previously approximated cards ═══════════
// Also adds: Muckmouth Bauble, Ancient Reclamation, improved Scavenger Bot,
//            BREAKER/limitBlockers infrastructure (enforced in combat.js + effects.js).

const EXPANSION6 = {

  // ─── FIXED SPELLS ───

  // RED — Overclock Surge: "+1 power; +1 additional if the creature has any BLEED keyword"
  'Overclock Surge': {
    targets: [{ type: 'creature', label: 'creature to overclock' }],
    onPlay: [
      { type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' },
      {
        type: 'buff', power: 1, duration: 'endOfTurn', target: 'target',
        onlyIf: (ctx) => {
          const t = (ctx.targets || [])[0];
          if (!t || t.kind !== 'creature') return false;
          const c = G[t.side]?.creatures?.[t.slotIdx];
          return c ? hasKeyword(c, 'BLEED') : false;
        },
      },
    ],
  },

  // RED — Drone Hack: exhaust target, controller gains bleed = ceil(power / 2)
  'Drone Hack': {
    targets: [{ type: 'creature', label: 'creature to hack' }],
    onPlay: [
      { type: 'exhaust', target: 'target' },
      {
        type: 'custom',
        fn: (ctx, events) => {
          const t = (ctx.targets || [])[0];
          if (!t || t.kind !== 'creature') return false;
          const c = G[t.side]?.creatures?.[t.slotIdx];
          if (!c) return false;
          const bleedAmt = Math.ceil((c.power || 0) / 2);
          if (bleedAmt <= 0) return false;
          G[t.side].bleedPool = (G[t.side].bleedPool || 0) + bleedAmt;
          events.push({ type: 'bleed-add', side: t.side, amount: bleedAmt, source: 'DroneHack' });
          return true;
        },
      },
    ],
  },

  // WHITE — Purity Pulse: remove up to 2 bleed from target player; draw = amount actually removed
  'Purity Pulse': {
    targets: [{ type: 'player', label: 'player to cleanse' }],
    onPlay: [
      {
        type: 'custom',
        fn: (ctx, events) => {
          const t = (ctx.targets || [])[0];
          const targetSide = (t?.kind === 'player') ? t.side : ctx.sourceSide;
          const current = G[targetSide]?.bleedPool || 0;
          const removed = Math.min(2, current);
          G[targetSide].bleedPool = current - removed;
          events.push({ type: 'bleed-remove', side: targetSide, amount: removed });
          if (removed > 0) {
            const deck = G[ctx.sourceSide]?.deck || [];
            const hand = G[ctx.sourceSide]?.hand || [];
            let drawn = 0;
            for (let i = 0; i < removed && deck.length > 0; i++) {
              hand.push(deck.shift());
              drawn++;
            }
            if (drawn > 0) events.push({ type: 'draw', side: ctx.sourceSide, amount: drawn });
          }
          return true;
        },
      },
    ],
  },

  // WHITE — Ancestral Tribute: destroy target relic; if it was YOURS, gain blood = its blood cost
  'Ancestral Tribute': {
    targets: [{ type: 'relic', label: 'relic to destroy' }],
    onPlay: [
      {
        type: 'custom',
        fn: (ctx, events) => {
          const t = (ctx.targets || [])[0];
          if (!t || t.kind !== 'relic') return false;
          const relic = G[t.side]?.relics?.[t.slotIdx];
          if (!relic) return false;
          const relicName = relic.name;
          // Read blood cost before destroying
          const healAmt = (t.side === ctx.sourceSide) ? (relic.bloodCost || 0) : 0;
          sacrificeRelic(t.side, t.slotIdx);
          events.push({ type: 'relic-destroyed', side: t.side, name: relicName });
          if (healAmt > 0) {
            G[ctx.sourceSide].blood = (G[ctx.sourceSide].blood || 0) + healAmt;
            events.push({ type: 'heal', side: ctx.sourceSide, amount: healAmt });
          }
          return true;
        },
      },
    ],
  },

  // WHITE — Radiant Reprisal: exhaust attacking creature, gain blood = its power
  'Radiant Reprisal': {
    targets: [{ type: 'creature', label: 'attacking creature' }],
    onPlay: [
      { type: 'exhaust', target: 'target' },
      { type: 'heal', amountFrom: 'targetPower', target: 'controller' },
    ],
  },

  // BLACK — Wicked Harvest: buff target creature +N where N = # of Creature cards in YOUR discard
  'Wicked Harvest': {
    targets: [{ type: 'creature', label: 'creature to empower' }],
    onPlay: [
      {
        type: 'custom',
        fn: (ctx, events) => {
          const t = (ctx.targets || [])[0];
          if (!t || t.kind !== 'creature') return false;
          const c = G[t.side]?.creatures?.[t.slotIdx];
          if (!c) return false;
          const discardCount = (G[ctx.sourceSide]?.discard || []).filter(
            card => card.type === 'Creature'
          ).length;
          if (discardCount <= 0) return false;
          c.power = (c.power || 0) + discardCount;
          c._tempPowerBonus = (c._tempPowerBonus || 0) + discardCount;
          c._tempBonusExpiresAt = 'endOfTurn';
          events.push({ type: 'buff', side: t.side, slotIdx: t.slotIdx, name: c.name, power: discardCount });
          return true;
        },
      },
    ],
  },

  // BLACK — Grave Reanimation: create 1 Wolf token on target creature;
  //   if you ALREADY had a Wolf-token creature in play, all your Wolf-bearing creatures
  //   gain HASTE and TIRELESS until end of turn.
  'Grave Reanimation': {
    targets: [{ type: 'ownCreature', label: 'creature to receive Wolf token' }],
    onPlay: [
      { type: 'createToken', tokenType: 'Wolf', target: 'target' },
      {
        type: 'custom',
        fn: (ctx, events) => {
          const side = ctx.sourceSide;
          const t = (ctx.targets || [])[0];
          const targetC = t ? G[side]?.creatures?.[t.slotIdx] : null;
          // After the token was just created, check if wolves existed BEFORE this cast:
          //   - target now has 2+ Wolves → it had at least 1 before
          //   - any OTHER creature has at least 1 Wolf
          const hadWolvesAlready = (G[side]?.creatures || []).some(c => {
            if (!c) return false;
            const wolfCount = (c.tokens || []).filter(tok => tok === 'Wolf').length;
            return c === targetC ? wolfCount >= 2 : wolfCount >= 1;
          });
          if (!hadWolvesAlready) return false;
          let any = false;
          for (const c of (G[side]?.creatures || [])) {
            if (!c || !(c.tokens || []).includes('Wolf')) continue;
            grantKeyword(c, 'HASTE', 'endOfTurn');
            grantKeyword(c, 'TIRELESS', 'endOfTurn');
            events.push({ type: 'grant-keyword', side, name: c.name, keyword: 'HASTE', duration: 'endOfTurn' });
            events.push({ type: 'grant-keyword', side, name: c.name, keyword: 'TIRELESS', duration: 'endOfTurn' });
            any = true;
          }
          return any;
        },
      },
    ],
  },

  // BLACK — Grave Whisper: return the most-recent Creature card with power ≤ 2 from discard to hand
  'Grave Whisper': {
    targets: [],
    onPlay: [
      {
        type: 'custom',
        fn: (ctx, events) => {
          const side = ctx.sourceSide;
          const discard = G[side]?.discard || [];
          for (let i = discard.length - 1; i >= 0; i--) {
            const card = discard[i];
            if (card.type === 'Creature' && (card.power || 0) <= 2) {
              discard.splice(i, 1);
              (G[side].hand || (G[side].hand = [])).push(card);
              events.push({ type: 'return-to-hand', side, name: card.name });
              return true;
            }
          }
          return false;
        },
      },
    ],
  },

  // RED — Left Behind: target opponent can only block with 1 creature this combat phase
  'Left Behind': {
    targets: [],
    onPlay: [
      { type: 'limitBlockers', amount: 1, target: 'opponent' },
      { type: 'addBleed', amount: 1, target: 'opponent' },
    ],
  },

  // PURPLE — Eternal Subterfuge: remove target creature from game;
  //   caster gains a Raven token on their first creature (representing the Illusion)
  'Eternal Subterfuge': {
    targets: [{ type: 'creature', label: 'creature to replace with Illusion' }],
    onPlay: [
      {
        type: 'custom',
        fn: (ctx, events) => {
          const t = (ctx.targets || [])[0];
          if (!t || t.kind !== 'creature') return false;
          const c = G[t.side]?.creatures?.[t.slotIdx];
          if (!c) return false;
          const name = c.name;
          sacrificeCreature(t.side, t.slotIdx);
          events.push({ type: 'creature-destroyed', side: t.side, name });
          // Caster gets an Illusion (Raven) token orbiting their first available creature
          const casterFirst = (G[ctx.sourceSide]?.creatures || []).find(cr => cr);
          if (casterFirst) {
            if (!casterFirst.tokens) casterFirst.tokens = [];
            if (casterFirst.tokens.length < 5) {
              casterFirst.tokens.push('Raven');
              events.push({ type: 'token-created', side: ctx.sourceSide, hostName: casterFirst.name, tokenType: 'Raven', amount: 1 });
            }
          }
          return true;
        },
      },
    ],
  },

  // PURPLE — Mindforge Dominion: gain control of target enemy creature (uses gainControl effect)
  'Mindforge Dominion': {
    targets: [{ type: 'enemyCreature', label: 'enemy creature to seize' }],
    onPlay: [
      { type: 'gainControl', target: 'target' },
    ],
  },

  // ─── NEW CARDS ───

  // COLORLESS — Muckmouth Bauble (relic): "Exhaust: Add {G} (gain 1 gold)"
  'Muckmouth Bauble': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [],
      effects: [{ type: 'gainGold', amount: 1 }],
    },
  },

  // COLORLESS — Scavenger Bot (improved): destroy own relic, gain blood = its actual bloodCost
  'Scavenger Bot': {
    activatedAbility: {
      cost: { exhaust: true },
      targets: [{ type: 'ownRelic', label: 'relic to salvage' }],
      effects: [
        {
          type: 'custom',
          fn: (ctx, events) => {
            const t = (ctx.targets || [])[0];
            if (!t || t.kind !== 'relic') return false;
            const relic = G[t.side]?.relics?.[t.slotIdx];
            if (!relic) return false;
            const healAmt = Math.max(1, relic.bloodCost || 2);
            const relicName = relic.name;
            sacrificeRelic(t.side, t.slotIdx);
            events.push({ type: 'relic-destroyed', side: t.side, name: relicName });
            G[ctx.sourceSide].blood = (G[ctx.sourceSide].blood || 0) + healAmt;
            events.push({ type: 'heal', side: ctx.sourceSide, amount: healAmt });
            return true;
          },
        },
      ],
    },
  },

  // WHITE — Ancient Reclamation: return the most-recent Wall creature from your discard to hand
  'Ancient Reclamation': {
    targets: [],
    onPlay: [
      {
        type: 'custom',
        fn: (ctx, events) => {
          const side = ctx.sourceSide;
          const discard = G[side]?.discard || [];
          for (let i = discard.length - 1; i >= 0; i--) {
            const card = discard[i];
            if (card.type === 'Creature' && hasKeyword(card, 'WALL')) {
              discard.splice(i, 1);
              (G[side].hand || (G[side].hand = [])).push(card);
              events.push({ type: 'return-to-hand', side, name: card.name });
              return true;
            }
          }
          return false;
        },
      },
    ],
  },

};

Object.assign(CARD_EFFECTS, EXPANSION6);

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

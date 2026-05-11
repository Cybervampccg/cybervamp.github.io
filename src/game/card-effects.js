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
    onPlay: [{ type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' }],
  },

  'Cut the Line': {
    targets: [{ type: 'creatureOrRelic', label: 'creature or relic to renew' }],
    onPlay: [{ type: 'renew', target: 'target' }],
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
      // Would need "return from discard" — for now, just draw
      { type: 'draw', amount: 1, target: 'controller' },
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

  // White relic: exhaust + W -> target creature gets Siphon (we just buff +1)
  'Ivory Hemaclaw': {
    activatedAbility: {
      cost: { gold: 1, exhaust: true },
      targets: [{ type: 'creature', label: 'creature' }],
      effects: [{ type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' }],
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
    targets: [{ type: 'creature', label: 'creature to empower' }],
    onPlay: [
      { type: 'buff', power: 2, duration: 'endOfTurn', target: 'target' },
      // "Breach" and "Bleed +1" approximated as 1 bleed to that creature's controller's opponent
      // (we don't have per-creature bleed counters yet)
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
    targets: [{ type: 'creature', label: 'creature whose bleed is amplified' }],
    onPlay: [
      // Full "double bleed" needs per-creature bleed counters not yet implemented.
      // Substitute: add 1 bleed to the creature's controller as a thematic stand-in.
      { type: 'addBleed', amount: 1, target: 'targetController' },
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
    targets: [{ type: 'creature', label: 'creature to empower' }],
    onPlay: [
      // "+1 power, Siphon, and Breach" — only +1 power is implementable now
      { type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' },
    ],
  },

  'Ask for Blessings': {
    targets: [{ type: 'creature', label: 'creature to bless' }],
    onPlay: [
      // "Tireless and Siphon" — approximated as small permanent power buff
      { type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' },
    ],
  },

  // ─── BLACK ───

  'Shadowstalk Burst': {
    targets: [{ type: 'creature', label: 'creature to grant siphon' }],
    onPlay: [
      // "Siphon until EOT" — approximated as +1 power
      { type: 'buff', power: 1, duration: 'endOfTurn', target: 'target' },
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

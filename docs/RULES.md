# Cybervamp CCG — Engine Rules (Canonical)

**Status:** Source of truth. Engine and card data must match this document. If they conflict, this wins.

**Version:** 1.1
**Authors:** Aeternis (design) + Claude (engineering)

**Changelog v1.1:**
- Slot standardization: 5 creature slots, 4 relic slots (was 4/4)
- Combat: attacker-favored design rationale added
- Overexhaust: faction emphasis guidance added (§4.6)
- Glimpse: revised to "choose 1 to draw, rest to bottom of deck in random order"
- Pitch: explicitly does NOT trigger ON_PLAY/CAST effects
- New §17: damage source tags
- New §18: infinite loop protection (max trigger depth 20)
- New §19: copy restrictions
- Wall: zero-Power walls destroyed immediately
- New §20: keyword complexity tiers
- New §21: design philosophy (locked)

---

## Table of Contents

1. [Match Overview](#1-match-overview)
2. [Resources: Blood & Gold](#2-resources-blood--gold)
3. [Turn Structure](#3-turn-structure)
4. [Card Types](#4-card-types)
5. [Card State Flags](#5-card-state-flags)
6. [Combat](#6-combat)
7. [Keywords](#7-keywords)
8. [Bleed System](#8-bleed-system)
9. [Tokens](#9-tokens)
10. [Stack & Priority](#10-stack--priority)
11. [Pitch & Sac (Alternate Costs)](#11-pitch--sac-alternate-costs)
12. [Targeting](#12-targeting)
13. [Card Data Schema](#13-card-data-schema)
14. [Effect Types (Resolvers)](#14-effect-types-resolvers)
15. [Trigger Types](#15-trigger-types)
16. [Glossary](#16-glossary)
17. [Damage Source Tags](#17-damage-source-tags)
18. [Infinite Loop Protection](#18-infinite-loop-protection)
19. [Copy Restrictions](#19-copy-restrictions)
20. [Keyword Complexity Tiers](#20-keyword-complexity-tiers)
21. [Design Philosophy (Locked)](#21-design-philosophy-locked)

---

## 1. Match Overview

- **1v1**, mono-faction decks, ~6-minute target match length.
- **Factions:** Red, White, Purple, Black. Neutral (colorless) cards may be included in any deck.
- **Deck size:** Defined by content rules elsewhere; engine treats deck as an ordered list.
- **Starting hand:** Defined by content rules; engine draws starting hand at match start.
- **Win condition:** A player loses when their Blood reaches **0 or less**. Game ends immediately upon either player crossing this threshold; if both cross simultaneously, the game is a draw.

### 1.1 Board Layout

Each player has:

- **5 Creature Slots**
- **4 Relic Slots**

This is fixed. UI and engine must conform.

---

## 2. Resources: Blood & Gold

### 2.1 Blood (HP and Spell Resource)

- **Blood is both HP and the spell resource.** They are the same number. Spending Blood reduces HP.
- Players start at **30 Blood**.
- **Blood has a faction color** matching the deck:
  - Red deck → Red Blood
  - White deck → White Blood
  - Purple deck → Purple Blood
  - Black deck → Black Blood
- Faction Blood satisfies costs of its own color. Example: a Red deck pays `RR` by spending **2 Blood**.
- **Neutral/Colorless cards** (cost notation `C` or no color letter) can be paid by any deck's Blood.
- **Decks cannot cast off-color spells.** Red deck cannot cast a `WW` spell at all — the cost is unpayable for them.
- **Blood may be spent on either player's turn** (because spells are instant-speed; see §10).

### 2.2 Gold

- Gold is a **per-turn budget** used to play creatures, relics, and pay gold-cost ability activations.
- **Gold formula:** at the start of each turn, the active player's Gold is set to `min(turn_number, 10)`.
  - Turn 1 = 1 Gold, Turn 2 = 2 Gold, …, Turn 10+ = 10 Gold.
- **Gold does NOT carry over.** Unspent Gold is lost at end of turn. Effects that grant gold mid-turn add temporarily; any remainder is still discarded at end of turn.
- **Gold may only be spent on the active player's turn.**

### 2.3 Cost Notation

- Cost is a sequence of glyphs in card data, e.g. `RR`, `GGG`, `GR`, `C`, `GGGW`.
- **`G`** = generic Gold cost (one Gold per G).
- **Color letters** (R/W/P/B) = Blood cost of that color (one Blood per letter).
- **`C`** = neutral/colorless cost, payable from any Blood.
- A card with cost `GGR` requires **2 Gold + 1 Red Blood** to cast.
- A spell typically costs only Blood (e.g. `RR` = 2 Red Blood). A creature/relic typically costs only Gold (e.g. `GGG` = 3 Gold), occasionally with a Blood component.

---

## 3. Turn Structure

Each turn has five phases. Phases execute in strict order. The engine emits phase-change events that may trigger abilities.

### 3.1 Renewal Phase

Active player's permanents (creatures and relics) step toward Ready:
- **Overexhausted (180°)** → **Exhausted (90°)**
- **Exhausted (90°)** → **Ready** (upright)
- **Ready** → no change.

Engine also clears:
- End-of-turn temporary effects from the **previous active player's** prior turn that were waiting to expire.
- Once-per-turn ability flags on this player's permanents.
- Temporary damage tracking on this player's creatures.

**Newly Turned flag** (see §5) is cleared from this player's permanents that entered play on the *previous* turn — they are no longer summoning-sick.

### 3.2 Draw Phase

Active player draws **exactly 2 cards** from their deck.

- If the deck is empty when a draw is attempted, the player loses 1 Blood per missed card (deckout damage). The game does not end from deckout alone, but combined with low Blood it can lose.
- After draw, if hand > 7, see §3.5 End Phase for discard rule (engine enforces at End Phase).

### 3.3 Main Phase

Active player may, in any order:

- Play creatures (pay Gold cost, place into a creature slot; max 5)
- Play relics (pay Gold cost, place into a relic slot; max 4)
- Cast spells (pay Blood cost, resolve via stack)
- Activate abilities on their permanents (pay activation cost, resolve via stack)
- Declare and resolve combat (see §6)

Spells and abilities may **also** be cast by the **non-active player** during the active player's turn (see §10 stack).

### 3.4 Combat Phase

See §6 for full rules. Combat is part of the Main Phase conceptually; the "Combat Phase" label is used when the active player declares attackers.

### 3.5 End Phase

In order:

1. **End-of-turn cleanup:**
   - All `endOfTurn`-duration effects expire (temporary buffs, flags like CANT_BE_BLOCKED).
   - All `TEMPORARY`-flagged objects are destroyed.
2. **Bleed resolution:**
   - Each player loses Blood equal to their `bleedPool`, then `bleedPool = 0`.
   - This can cause a win/loss check.
3. **Wall Decay:**
   - Each Wall that blocked this turn permanently loses 1 Power.
   - If a Wall's Power reaches 0 from any cause (decay or damage), destroy it immediately.
4. **Combat damage cleanup:**
   - Any temporary damage on creatures clears.
5. **Hand size check:**
   - If the active player's hand has more than 7 cards, they must discard down to 7.
6. **Turn passes to the other player.**

---

## 4. Card Types

### 4.1 Creature

- Has Power, Cost, and ability text.
- Played into one of 5 creature slots on the controller's side.
- Can attack, block, support (unless flagged Wall).
- When destroyed, goes to discard pile.

### 4.2 Relic

- Permanent with no Power.
- Played into one of 4 relic slots on the controller's side.
- Persistent: passive abilities apply while in play; activated abilities can be triggered.
- When destroyed, goes to discard pile.

### 4.3 Spell

- Cast from hand, immediately resolves via stack, then goes to discard pile.
- **Instant speed** — castable on either player's turn (see §10).
- Pays Blood cost only (typically).
- May have a separate `pitch` mode (§11).

### 4.4 Token

- Created by card effects (see §9).
- Has no representation in any player's deck or hand.
- When destroyed or removed from play, **exiled** — does not enter discard pile (tokens cease to exist).
- **Visual identity:** rendered as orbiting entities / floating companions / attached combat effects, NOT as mini cards.

### 4.5 Wall

- Wall is technically a creature subtype, not a separate card type.
- See §6.4 for wall-specific combat rules and §3.5 for Wall Decay.

### 4.6 Faction Emphasis on Overexhaust

Different factions use overexhaust at different intensities. This is a design directive for card creation and AI tuning:

- **Purple:** heavy overexhaust use; burst combo turns; renewal-state manipulation.
- **Black:** reckless overexhaust; sacrifice value; temporary power spikes.
- **White:** renewal manipulation; recovery tools; stabilization.
- **Red:** minimal overexhaust; prefers immediate aggression.

---

## 5. Card State Flags

These flags exist on **in-play instances** of cards. They are stripped when a card leaves play (going to discard, hand, or being exiled).

| Flag | Meaning |
|------|---------|
| `READY` | Default. Card is upright, can attack/support/activate. |
| `EXHAUSTED` | 90° rotation. Cannot attack or support. Cannot pay an Exhaust cost. |
| `OVEREXHAUSTED` | 180° rotation. Cannot attack, support, or pay Exhaust costs. Requires two Renewal Phases to return to Ready. |
| `NEWLY_TURNED` | Summoning sickness. Set on a creature when it enters play. Prevents attacking and ability activation. Cleared at start of controller's NEXT Renewal Phase. Does not apply if creature has `HASTE`. |
| `WALL` | Card has the Wall keyword. Cannot attack, cannot support. Deals no combat damage unless specified. Wall Decay applies on block (§3.5). |
| `TOKEN` | Card is a token. Cannot exist outside play (no deck/hand/discard). |
| `TEMPORARY` | Card is destroyed at next End Phase regardless of other state. |
| `CANT_BE_BLOCKED_THIS_TURN` | Bypasses any blocker assignment. Cleared at End Phase. |
| `CANT_BE_DESTROYED_THIS_TURN` | Survives all "destroy" effects until End Phase. |
| `DAMAGE_PREVENTED_THIS_TURN` | If set with a value, prevents up to N damage this turn. |
| `_attacking` | Internal: declared as an attacker for the current combat. |
| `_blockedBy` | Internal: instance ID of the blocking creature, if any. |
| `_supporting` | Internal: this creature is supporting another in current combat. |
| `_supportedBy` | Internal: array of supporter instance IDs. |
| `_abilityUsedThisTurn` | Set after activating an ability with `oncePerTurn: true`. Cleared at next Renewal. |
| `_blockedThisTurn` | Set on Walls when they block, used for end-of-turn Wall Decay. |
| `_damageTaken` | Numeric. Combat/spell damage. Cleared at End Phase unless the source effect specifies otherwise. |

### Reset Rule

**Anything going to discard reverts to its printed state.** The engine destroys the in-play instance; if the card returns to play later (e.g. via Lying in Wait), a brand-new instance is created from the printed card data.

---

## 6. Combat

### 6.0 Design Intent

**Combat is intentionally attacker-favored.** Ties go to the attacker. This design choice supports:

- Fast pacing
- High creature turnover
- Aggressive board cycling
- Shorter match length
- Higher card draw relevance

Engine behavior must match this. **Equal power resolves in attacker's favor.**

### 6.1 Combat Flow

1. Active player declares **attackers** by tapping eligible creatures.
2. Active player presses CONFIRM ATTACK. This is a **priority window** — non-active player may cast instant-speed spells / activate abilities. Stack resolves before continuing (§10).
3. After all responses resolve, **declare blockers** step. Non-active player assigns one blocker per attacker (or none), then declares supporters for each blocker if any. Blockers do NOT exhaust; supporters DO exhaust when assigned.
4. After block assignment, another **priority window** — active player may cast responses.
5. **Damage resolution** — for each attacker:
   - If unblocked → deal damage to defending player. This is **Direct Damage**.
   - If blocked → compute combat math (§6.2). One side dies; if Breach is present, excess damage spills as Direct Damage.
6. After all combat damage applied, trigger `ON_DAMAGE`, `ON_DIRECT_DAMAGE`, and `ON_DEATH` events on the stack and resolve.
7. Combat ends; turn flow returns to Main Phase.

### 6.2 Combat Math

Per attacker-blocker pair:

```
attackerPower  = attacker.power
totalDefense   = blocker.power
                + sum(supporter.power_contribution for each supporter)
```

Where each supporter contributes **+1 Power** by default, or **+2** if the **blocker** has `FORTIFY`.

If attacker has `BREAKER`:
- All supporter contributions are ignored.
- Only the blocker's base Power counts.

**Resolution (attacker-favored):**

- If `attackerPower >= totalDefense` → **blocker dies**.
- If `attackerPower < totalDefense` → **attacker dies**.

Ties go to attacker by design (§6.0).

If attacker has `BREACH` and `attackerPower > blocker.power`:
- Excess damage = `attackerPower - blocker.power` (the **blocker's base**, NOT total defense including supporters).
- Excess is dealt to defending player as Direct Damage with `damageSourceType: combat` and `breach: true` (§17).

#### Eligibility

- **Attacker eligibility:** must be `READY`, not `NEWLY_TURNED` (unless `HASTE`), Power > 0, not a `WALL`.
- **Blocker eligibility:** must be `READY`, Power > 0. (Walls can block.)
- **Supporter eligibility:** must be `READY`, not a `WALL`.

#### Exhaust effects of combat

- Attackers become `EXHAUSTED` upon attacking, **unless** they have `TIRELESS`.
- Blockers do NOT exhaust from blocking. They remain `READY`.
- Supporters **DO** exhaust when assigned as supporters.

### 6.3 Outcome Resolution

For each pair, after combat math (§6.2 attacker-favored):
- Loser is sacrificed to discard.
- Supporters do NOT die from absorbing damage; they remain exhausted on the board.

### 6.4 Walls in Combat

- Walls **block normally** but cannot attack or support.
- Walls deal no combat damage by default (unless specifically granted Breaker or other power-deal abilities).
- **Wall Decay:** at End Phase, any Wall that participated in a block this turn permanently loses 1 Power. Tracked via `_blockedThisTurn`.
- If a Wall's Power reaches 0 (from decay or any source), destroy it immediately.

### 6.5 Selfbleed

- `SELFBLEED X` triggers when this creature:
  - Attacks, OR
  - Exhausts to activate an ability.
- Adds `X` Bleed to controller's bleed pool.
- Does NOT trigger on blocking or supporting.

### 6.6 Siphon

- `SIPHON` triggers when this creature deals **direct damage** to a player.
- Controller gains **1 Blood per point of direct damage dealt** by this source.

---

## 7. Keywords

| Keyword | Definition |
|---------|------------|
| `HASTE` | Bypasses `NEWLY_TURNED`. Can attack the turn played. |
| `TIRELESS` | Attacking does not exhaust this creature. Other sources can still exhaust it. |
| `BREAKER` | Ignores all supporter Power contributions during combat. |
| `FORTIFY` | When this creature blocks, supporters add +2 Power instead of +1. |
| `BREACH` | Excess combat damage past blocker's base Power spills to defending player. |
| `SIPHON` | See §6.6. |
| `SELFBLEED X` | See §6.5. |
| `BLEED X` | Apply X bleed tokens to the defending player when this creature deals direct damage. |
| `HEMORRHAGE: ...` | Triggered ability. Trigger condition varies per card; engine reads `trigger` field. |
| `WALL` | Cannot attack/support. Wall Decay applies. |

See §20 for keyword complexity tiers (Evergreen / Advanced / Expert).

---

## 8. Bleed System

### 8.1 Bleed Pool

- Each player has a `bleedPool` integer, starts at 0.
- Effects that add bleed (`APPLY_BLEED`) increase this pool.
- Effects that remove bleed (`REMOVE_BLEED`) decrease it (clamped at 0).

### 8.2 Resolution

- At End Phase, each player loses Blood equal to their bleed pool. Then bleed pool resets to 0.
- Bleed damage carries `damageSourceType: bleed` (§17).
- This can cause a win/loss check immediately.

### 8.3 Bleed sources

- Direct damage from creatures with `BLEED X` adds X to defending player's pool, after combat damage resolves.
- `SELFBLEED X` adds X to **controller's own** pool.
- Spell effects (`APPLY_BLEED`) target a player and add to that player's pool.

---

## 9. Tokens

### 9.1 Token Basics

- Tokens are creatures with the `TOKEN` flag.
- Token types in the canon: **Bat**, **Wolf**, **Raven**, **Zombie**, **Illusion** (and potentially others by card text).
- Tokens do NOT exist in any deck, hand, or discard. They exist only on the battlefield.
- When destroyed or removed from play, tokens are **exiled** (cease to exist; do NOT go to discard).
- **Visual identity:** rendered as orbiting entities, floating companions, or attached combat effects — NOT as mini cards.

### 9.2 Token Orbit Model

- Tokens **orbit a host creature**. A token is always attached to exactly one host.
- Maximum **5 tokens per host**.
- Multiple of the same type may orbit (e.g. 3 Wolf tokens on one host).
- If the host is destroyed, all orbiting tokens are also destroyed (exiled).

### 9.3 Token Stats (Default)

| Token | Power Contribution | Effect on Host |
|-------|-------------------|-----------------|
| **Raven** | +1 | none |
| **Bat** | +1 | Host's combat damage applies +1 Bleed to defending player |
| **Wolf** | +2 | Host gains BREAKER while attacking |
| **Zombie** | +3 | Host becomes OVEREXHAUSTED instead of EXHAUSTED after attacking |
| **Illusion** | 0 | Special: when host would take damage, Illusion is destroyed instead (up to once per orbiting Illusion) |

(Specific card effects may modify or replace these defaults.)

### 9.4 Token Combat

- Tokens do not attack independently.
- When the host attacks, attack power = host's power + sum of all orbiting token power contributions.
- A blocker engages the **host**. The host takes damage as normal (and may die). Token effects modify combat math but tokens themselves do not take blocker damage unless an effect specifies.

### 9.5 Sacrificing Tokens

- "Destroy a token you control" effects target one of YOUR own orbiting tokens.
- The token is exiled, the host remains.

---

## 10. Stack & Priority

### 10.1 Stack

- Effects (spells and triggered abilities) go onto a **stack** when cast/triggered.
- Effects resolve **LIFO** — last on, first off.
- Each effect, on resolution, **re-validates its targets** (target may have left play). If a required target is gone, the effect "fizzles" (does nothing, but still moves to discard if it was a spell).

### 10.2 Priority

- After any action (cast a spell, declare attack, declare blockers, etc.), **non-acting player gets priority**.
- If they take an action, that action goes on the stack and priority passes again.
- If both players pass priority **consecutively**, the top of the stack resolves.
- Resolution itself does not change priority — after resolving, priority returns to the active player.

### 10.3 Instant-Speed Spells

- All spells are instant-speed. Either player may cast spells at any priority window.
- Activated abilities on permanents are also instant-speed unless otherwise specified.
- **Sorcery-speed restriction:** none currently. (Future cards may add this; engine should support it.)

### 10.4 Priority Windows in Combat

The combat sequence (§6.1) has explicit priority windows:

1. After attacker declaration, before block declaration.
2. After block & support declaration, before damage resolution.
3. After damage resolution (death triggers go on stack).

### 10.5 Triggered Abilities

- When a trigger event fires (`ON_PLAY`, `ON_ATTACK`, `ON_DAMAGE`, etc.), the triggered ability is **placed onto the stack** immediately. It does not resolve until the stack is empty above it.
- Multiple triggers from one event are stacked in **active-player-first** order: all triggers from the active player's permanents stack first, then non-active.
- Players retain priority after triggers stack; opponent may respond to triggers before they resolve.
- Recursive triggering is bounded — see §18.

---

## 11. Pitch & Sac (Alternate Costs)

### 11.1 Pitch

- Pitch is an **alternate casting mode** for some cards (Spells primarily, occasionally others).
- Card data has two parallel effect lists: `abilities` (normal play) and `pitchAbilities` (pitch play).
- Card data has two costs: `cost` (normal) and `pitchCost` (when pitched).
- When pitched: card goes directly from hand to discard (or is exiled, per card text). Only the `pitchAbilities` fire.

#### Pitch is NOT casting

A pitched card is **not considered cast**:

- Does NOT trigger `ON_PLAY`.
- Does NOT trigger any CAST-related effect.
- Only triggers `ON_PITCH`.

Pitch effects resolve independently of the normal play path.

#### UI

- Pitch is offered as:
  - A button in the card preview menu ("PITCH instead of PLAY")
  - A drag gesture from hand to the discard pile

### 11.2 Sac (Sacrifice)

- Sac is an **activated-ability cost**: the controller sends this card to discard to pay the cost.
- Sac does **not** require the card to be Ready, Exhausted, or any other state. A creature can be sacced **the same turn it's played**, even with `NEWLY_TURNED`.
- After Sac, the card goes to discard (reverting to printed state). Then effects resolve.

#### Sac vs. self-destroy

- "Sac" is a controller-paid cost. "Destroy this creature" without cost is an effect (e.g. a triggered ability).
- Mechanically the result is the same (card to discard), but Sac specifically denotes an activated-ability cost.

---

## 12. Targeting

### 12.1 Target Types

| Type | Resolves To |
|------|-------------|
| `SELF` | The source card (the one whose effect is resolving). |
| `CONTROLLER` | The player who controls the source. |
| `OPPONENT` | The other player. |
| `PLAYER` | Either player. UI-picked. |
| `CREATURE` | Any creature on either side. UI-picked. |
| `OWN_CREATURE` | A creature controlled by the source's controller. UI-picked. |
| `ENEMY_CREATURE` | A creature controlled by the opponent. UI-picked. |
| `RELIC` | Any relic. UI-picked. |
| `OWN_RELIC` | Source's controller's relic. UI-picked. |
| `ENEMY_RELIC` | Opponent's relic. UI-picked. |
| `WALL` | Any creature with `WALL` flag. |
| `TOKEN` | Any token. |
| `ATTACKING_CREATURE` | A creature currently flagged `_attacking`. |
| `BLOCKING_CREATURE` | A creature currently assigned as a blocker. |
| `CREATURE_OR_PLAYER` | Either. UI-picked. |
| `CREATURE_OR_RELIC` | Either. UI-picked. |
| `ALL_CREATURES` | No pick. Effect fans out across all creatures. |
| `ALL_ENEMY_CREATURES` | No pick. Fans out across opponent's creatures. |
| `ALL_OWN_CREATURES` | No pick. Fans out across controller's creatures. |
| `NONE` | No target needed. |

### 12.2 Target Filters

Cards may specify a `filter` function in their target requirement, e.g.:
- "Target overexhausted creature" → filter to those with `OVEREXHAUSTED` flag.
- "Target non-wall creature" → filter excluding `WALL`.
- "Target attacking creature" → filter to `_attacking`.

### 12.3 Optional Targets

A target may be marked `optional: true`. UI offers a SKIP TARGET button. If skipped, the corresponding effects with `skipIfMissing: true` are silently dropped.

### 12.4 Duplicate Targeting

"Up to N targets" allows the **same target picked multiple times** unless explicitly forbidden. Example: "Give -1 Power to up to 2 creatures" can hit the same creature twice for -2 total.

### 12.5 Re-validation at Resolution

When an effect resolves, targets are re-checked:
- If a target has left play (creature destroyed, relic destroyed) → effect's contribution for that target is dropped.
- If ALL targets are gone, the effect fizzles (still moves to discard if a spell).

---

## 13. Card Data Schema

Every card is defined in `card-database.js` with this canonical shape:

```js
{
  id: 'red-creature-001',           // stable unique ID
  name: 'Neon Revenant Striker',
  color: 'Red',                      // Red | White | Purple | Black | Colorless
  type: 'Creature',                  // Creature | Spell | Relic
  subtype: 'Wall' | 'Token' | null,
  rarity: 'Common',
  cost: 'G',                         // cost string per §2.3
  power: 2,                          // creatures only; nullable
  flavor: '...',                     // display only
  image: '...',                      // URL

  // For permanents (creatures, relics) and spells, abilities are defined here:
  abilities: [
    {
      trigger: 'ON_PLAY',            // see §15 for trigger types
      conditions: [],                // optional gating predicates
      targets: [                     // see §12; resolved before effects fire
        { type: 'CREATURE', label: 'target creature', optional: false }
      ],
      effects: [                     // see §14
        { type: 'DEAL_DAMAGE', amount: 2, target: 'target' }
      ],
      cost: null                     // for ACTIVATED triggers, see below
    }
  ],

  // For spells with a pitch mode:
  pitchCost: 'R',                    // alt cost, see §11.1
  pitchAbilities: [                  // alt effect list when pitched
    { trigger: 'ON_PITCH', targets: [], effects: [{ type: 'DRAW', amount: 1, target: 'CONTROLLER' }] }
  ],

  // For creatures, base keywords (auto-applied as flags / behaviors):
  keywords: ['HASTE', 'BLEED:1', 'TIRELESS'],

  // Optional combat hooks (most cards use keywords; some need custom):
  combatHooks: {
    onAttack: [...],
    onBlocked: [...]
  }
}
```

### 13.1 Abilities Array

The `abilities` array can have **multiple entries**, each with a different trigger. Examples:

- Creature with both an ON_PLAY effect AND an ACTIVATED effect → two entries.
- Relic with an ON_TURN_START passive AND a {Exhaust} activated → two entries.

### 13.2 Activated Ability Cost Structure

For activated abilities (`trigger: 'ACTIVATED'`), the `cost` field specifies what the controller pays:

```js
cost: {
  gold: 2,                 // gold to pay
  blood: 1,                // blood to pay (HP loss)
  bloodColor: 'R',         // if specified, blood must be this color
  exhaust: true,           // requires source to be Ready, then exhausts it
  overexhaust: true,       // requires source to be Exhausted, then overexhausts it
  sacrificeSelf: true,     // pays Sac cost (source to discard)
  sacrificeToken: 'Bat',   // sacrifice a token of this type (or any token if 'any')
  destroyOwnPermanent: 'Relic' | 'Creature' | 'Wall',
  oncePerTurn: true        // ability-level limit
}
```

Activated abilities require all cost components to be payable simultaneously. If any cannot be paid, the ability cannot be activated.

---

## 14. Effect Types (Resolvers)

All effects are listed as objects in `effects: [...]`. The engine routes each to a dedicated resolver.

### 14.1 Core Effects

| Effect Type | Parameters | Behavior |
|-------------|-----------|----------|
| `DEAL_DAMAGE` | `amount`, `target`, `amountFrom`, `damageSourceType` | Deals damage to target. If target is creature, increment `_damageTaken`; if >= power, destroy. If player, reduce Blood. Carries source tag (§17). |
| `HEAL` | `amount`, `target` | Add Blood to target player. |
| `MODIFY_POWER` | `power`, `duration` (`endOfTurn`/`permanent`), `target` | Modify creature's power. Stored as `_tempPowerBonus` or `_permanentPowerBonus`. Permanent stays only while card is in play. |
| `DESTROY` | `target` | Destroy target creature/relic; moves to discard (or exile if token). |
| `EXHAUST` | `target` | Set EXHAUSTED flag. If already exhausted, becomes overexhausted. |
| `OVEREXHAUST` | `target` | Set OVEREXHAUSTED flag directly. |
| `RENEW` | `target` | Clear EXHAUSTED and OVEREXHAUSTED flags. |
| `DRAW` | `amount`, `target` (player) | Player draws N from their deck. |
| `DISCARD` | `amount`, `target` (player), `mode` (`random`/`choice`) | Player discards N. Random by default. |
| `APPLY_BLEED` | `amount`, `target` (player) | Add to bleed pool. |
| `REMOVE_BLEED` | `amount`, `target` (player) | Subtract from bleed pool (min 0). |
| `RETURN_TO_HAND` | `target` (creature) | Move creature from board to its owner's hand. Strip in-play state. |
| `RETURN_FROM_DISCARD` | `target` (player), `mode` (`top`/`choice`/`random`), `cardFilter` | Move card from discard to hand. |
| `GAIN_GOLD` | `amount`, `target` (player) | Add gold mid-turn (lost at end of turn as usual). |
| `CREATE_TOKEN` | `tokenType`, `amount`, `host` | Create token(s) orbiting host. Token capped at 5/host. |
| `DESTROY_TOKEN` | `target` | Exile a token. |
| `SET_FLAG` | `flag`, `target`, `duration` | Set a state flag (e.g. CANT_BE_BLOCKED_THIS_TURN). |
| `CLEAR_FLAG` | `flag`, `target` | Remove a state flag. |
| `PREVENT_DAMAGE` | `amount`, `target` | Prevent up to N damage to target this turn. |
| `GLIMPSE` | `amount`, `target` (player), `then` | See §14.4. Mobile-friendly: pick 1 to draw, rest go to bottom in random order. |
| `COPY` | `target`, `copyTarget` | Make `target` (e.g. a creature) become a copy of `copyTarget`. See §19 for restrictions. |
| `GAIN_CONTROL` | `target` (creature), `duration` | Take control of target until duration expires (end of turn / permanent). |
| `MULTI_EFFECT` | `effects: [...]` | Run a nested list of effects in order (used for "if/then" chains). |
| `IF_DESTROYED` | `then: [...]` | Run nested effects only if the previous effect destroyed something. |
| `IF_CONDITION` | `condition`, `then`, `else` | Branch based on a predicate evaluation. |

### 14.2 Dynamic Amounts

`amount` can be a number OR `amountFrom: 'TARGET_POWER' | 'CONTROLLER_BLEED' | 'TARGET_BLEED' | 'X_REMOVED'` etc.

### 14.3 Target Resolution Within Effects

`target` in an effect can be:
- A literal target token: `'target'` (first picked target), `'target2'`, `'target3'`, …
- A keyword: `'CONTROLLER'`, `'OPPONENT'`, `'SELF'`.
- A fan-out: `'ALL_CREATURES'`, `'ALL_ENEMY_CREATURES'`, `'ALL_OWN_CREATURES'`.

### 14.4 GLIMPSE Resolution (Mobile-First)

**GLIMPSE X** resolves as:

1. Reveal top X cards of controller's deck.
2. Controller chooses **1 card** to draw (added to hand).
3. **Remaining X-1 cards go to the BOTTOM of the deck in RANDOM order.**

This replaces any prior wording about reordering top of deck. Random-bottom is locked behavior for:

- Faster mobile UX (no drag-to-reorder UI)
- Less decision fatigue
- Easier AI implementation

If a card has `ON_GLIMPSE` triggers (e.g. "if you Glimpse a spell, draw it"), those triggers reference cards revealed during this Glimpse only, not any other deck-peek effects.

---

## 15. Trigger Types

Triggers are the **when** of an ability.

| Trigger | Fires When |
|---------|-----------|
| `ON_PLAY` | Card enters play (creatures, relics). For spells, fires on cast resolution. NOT triggered by pitch. |
| `ACTIVATED` | Manually activated by controller (double-tap / button). Cost must be paid. |
| `ON_ATTACK` | When this creature declares attack. |
| `ON_BLOCK` | When this creature is declared as a blocker, OR when this creature is blocked. (Per card text.) |
| `ON_DAMAGE` | When this creature takes damage. |
| `ON_DIRECT_DAMAGE` | When this creature deals damage directly to a player (unblocked attack or Breach overflow). |
| `ON_DEATH` | When this creature/relic is destroyed (immediately before instance is destroyed). |
| `ON_EXHAUST` | When this card becomes exhausted (any source). |
| `ON_OVEREXHAUST` | When this card becomes overexhausted. |
| `ON_SUPPORT` | When this creature is assigned as a supporter. |
| `ON_PITCH` | When this card is cast via Pitch mode (§11.1). The ONLY trigger fired by pitching. |
| `ON_GLIMPSE` | When this card is revealed by a Glimpse effect. |
| `ON_TURN_START` | At start of controller's Renewal Phase. |
| `ON_TURN_END` | At controller's End Phase. |
| `ON_DRAW` | When this card is drawn. (Rare; used for "if drawn, reveal X.") |
| `ON_BLEED_RESOLVE` | When the bleed pool is about to deal damage to controller. |
| `HEMORRHAGE` | When controller has any bleed counters in their pool. (Continuous, not stack-triggered.) |

### 15.1 Conditions

Each ability entry can have `conditions: [...]`. All must be true for the ability to trigger/be playable.

Examples: `{ check: 'CONTROLLER_HAS_BLEED' }`, `{ check: 'OWN_CREATURE_COUNT_GTE', value: 2 }`.

---

## 16. Glossary

- **Active player:** Whoever's turn it is.
- **Controller:** Whoever currently controls a given card.
- **Owner:** Whoever has the card in their deck. Differs from controller only when a GAIN_CONTROL effect is in play.
- **Source:** The card whose ability is resolving.
- **Direct damage:** Damage dealt to a player (vs. creature damage).
- **Instance:** A specific in-play copy of a card with its own mutable state. Two copies of the same card on the board are two instances.
- **Printed state:** The base immutable card data with no in-play modifications.
- **In-play instance:** A mutable runtime object created from printed data when the card enters play.

---

## 17. Damage Source Tags

Every damage instance carries a `damageSourceType` field. Engine emits this on every damage event for filtering, prevention, balancing, analytics, and reactive effects.

| Tag | Meaning |
|-----|---------|
| `combat` | Damage from a combat outcome (attacker hits blocker or player). |
| `spell` | Damage dealt by a spell effect. |
| `relic` | Damage dealt by a relic's activated/triggered ability. |
| `bleed` | Damage from bleed-pool resolution at End Phase. |
| `token` | Damage attributed to a token's contribution. |
| `ability` | Damage from a creature/relic activated ability not covered above. |

Additional optional fields:
- `breach: true` — for Breach overflow damage
- `sourceCard: <instanceId>` — for trigger filtering
- `damageDealtBy: <controllerSide>` — for "deals damage" triggers

Example: A Veinshock Pulse spell hitting a creature emits `{ type: damage, amount: 1, damageSourceType: 'spell', sourceCard: <veinshock instId> }`.

---

## 18. Infinite Loop Protection

Triggered abilities cannot recursively re-trigger themselves from their own resolution unless explicitly stated in card data via `allowRecursion: true`.

### Trigger Depth Limit

- The engine tracks **trigger depth** for any single root event.
- **Maximum trigger depth: 20.**
- If trigger depth would exceed 20:
  - Stop creating further triggers.
  - Continue resolving the current stack safely.
  - Log the event as an `INFINITE_LOOP_GUARD` event for debugging.

### Self-Trigger Suppression

A card cannot trigger its own ability via its own effect unless `allowRecursion: true` is set on that ability. This prevents accidental loops in basic card design.

---

## 19. Copy Restrictions

`COPY` effects copy **only printed card data**. The new instance starts fresh.

### Copied

- Card name, type, color, cost, power (base/printed)
- Abilities (full abilities array)
- Keywords
- Image/flavor

### NOT Copied

- Temporary buffs (`_tempPowerBonus`)
- Permanent buffs (`_permanentPowerBonus`)
- Damage (`_damageTaken`)
- Bleed counters
- Attached tokens
- Runtime flags (`_attacking`, `_blockedBy`, `_abilityUsedThisTurn`, etc.)
- Exhaust state
- Overexhaust state
- All temporary state of any kind

A copy enters play in **default state** (READY, no flags, no in-play modifiers) — unless explicitly overridden in the COPY effect's parameters (e.g., `enterExhausted: true`).

---

## 20. Keyword Complexity Tiers

For tutorial pacing, AI deckbuilding, onboarding, and future PvE progression:

### 20.1 Evergreen (Tier 1, low complexity)

Core mechanics expected in every faction. New players learn these first.

- `HASTE`
- `TIRELESS`
- `BREACH`
- `SIPHON`
- `WALL`

### 20.2 Advanced (Tier 2, moderate complexity)

Mid-game depth. Introduced after evergreen comprehension.

- `BREAKER`
- `FORTIFY`
- `OVEREXHAUST`
- `SELFBLEED`

### 20.3 Expert (Tier 3, high complexity)

Advanced strategic tools. Reserved for high-tier decks and tutorials phase 3+.

- `HEMORRHAGE`
- `GLIMPSE` triggers
- `COPY`
- `GAIN_CONTROL` (control swap)
- Recursive reanimation

---

## 21. Design Philosophy (Locked)

The game prioritizes, in order:

1. Fast gameplay
2. High creature turnover
3. Aggressive combat pacing
4. Low board stagnation
5. Minimal tracking burden
6. Strong faction identity
7. Mobile readability
8. Visually satisfying combat
9. Collectible presentation
10. Low-complexity / high-depth gameplay

**Avoid adding unnecessary additional mechanics.**

Future development focus:
- Visual polish
- Animation
- Sound design
- UI clarity
- AI behavior
- Onboarding
- Game feel

**NOT** mechanical complexity increase. New mechanics require explicit design approval and a clear pacing/identity justification.

---

## END OF RULES

This document supersedes all prior rules notes. Engine implementation must conform to this spec. Card data must be expressed in the schema in §13.

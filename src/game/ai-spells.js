// ─────────────────────────────────────────────────────────────
// ai-spells.js — AI plays spells and activates abilities
//
// Simple heuristic AI:
//   - Goes through hand looking for supported spells
//   - For each, picks the best target (cheap heuristics per effect type)
//   - Casts if affordable
//
//   - Goes through own permanents looking for activated abilities
//   - Activates if affordable and target available
// ─────────────────────────────────────────────────────────────

import { G } from './state.js';
import { canPlaySpell, getSpellTargetRequirements, playSpellFromHand } from './spells.js';
import { canActivateAbility, getAbilityTargetRequirements, activateAbility } from './abilities.js';
import { getValidTargets } from './effects.js';
import { getCardEffects, hasActivatedAbility, isSpellSupported } from './card-effects.js';

const SIDE = 'ai';
const ENEMY = 'player';

// Pick the best target for one requirement.
// Heuristic: damage/destroy → strongest enemy; buff → strongest own;
//            renew → most exhausted own; bleed → enemy player; player → enemy player.
function pickTarget(req, effects) {
  const valid = getValidTargets(req.type, SIDE, req.filter);
  if (valid.length === 0) return null;

  // Identify primary effect type for this target
  const primaryEff = effects?.[0]?.type || 'damage';

  // Player target → prefer enemy for damage, controller for heal/draw
  if (req.type === 'player') {
    const enemy = valid.find(v => v.side === ENEMY);
    const me = valid.find(v => v.side === SIDE);
    if (['damage', 'addBleed', 'discard'].includes(primaryEff)) return enemy || me;
    if (['heal', 'draw', 'removeBleed'].includes(primaryEff)) return me || enemy;
    return enemy || me;
  }

  // creatureOrPlayer — prefer the enemy player (face damage)
  if (req.type === 'creatureOrPlayer') {
    const enemyPlayer = valid.find(v => v.kind === 'player' && v.side === ENEMY);
    if (enemyPlayer && ['damage'].includes(primaryEff)) return enemyPlayer;
  }

  // For creature target, prefer based on effect
  const enemyCreatures = valid.filter(v => v.kind === 'creature' && v.side === ENEMY);
  const ownCreatures = valid.filter(v => v.kind === 'creature' && v.side === SIDE);

  if (['damage', 'destroy', 'exhaust', 'overexhaust', 'returnToHand'].includes(primaryEff)) {
    // Pick strongest enemy creature
    if (enemyCreatures.length > 0) {
      enemyCreatures.sort((a, b) => (b._inst?.power || 0) - (a._inst?.power || 0));
      return enemyCreatures[0];
    }
    // No enemies — skip
    return null;
  }

  if (['buff', 'addPowerCounter'].includes(primaryEff)) {
    if (ownCreatures.length > 0) {
      ownCreatures.sort((a, b) => (b._inst?.power || 0) - (a._inst?.power || 0));
      return ownCreatures[0];
    }
    return null;
  }

  if (primaryEff === 'renew') {
    // Find most exhausted own creature/relic
    const exhausted = valid.filter(v => v.side === SIDE && (v._inst?.overexhausted || v._inst?.exhausted));
    return exhausted[0] || null;
  }

  // Default: first valid
  return valid[0];
}

// Try to cast every spell in AI's hand that has a supported effect and is affordable.
// Returns array of events for the UI to play back.
export function aiCastSpells(onAction) {
  const allEvents = [];
  const hand = [...(G[SIDE]?.hand || [])];

  for (const inst of hand) {
    if (!['Spell', 'spell'].includes(inst.type)) continue;
    if (!isSpellSupported(inst)) continue;

    const check = canPlaySpell(SIDE, inst.instId);
    if (!check.ok) continue;

    const def = getCardEffects(inst);
    const reqs = getSpellTargetRequirements(inst);

    // Resolve targets
    const targets = [];
    let canResolve = true;
    for (const req of reqs) {
      const t = pickTarget(req, def.onPlay);
      if (!t) {
        if (req.optional) {
          targets.push(null);
          continue;
        }
        canResolve = false;
        break;
      }
      targets.push(t);
    }
    if (!canResolve) continue;

    const result = playSpellFromHand(SIDE, inst.instId, targets);
    if (result.ok) {
      allEvents.push({ type: 'ai-cast', name: inst.name });
      allEvents.push(...(result.events || []));
      if (onAction) onAction({ type: 'cast', card: inst, events: result.events });
    }
  }

  return allEvents;
}

// Try to activate each AI permanent's ability if useful.
// Conservative: only activate abilities that benefit AI directly
// (damage, destroy, bleed, draw, removeBleed (on self), buff own creature).
export function aiActivateAbilities(onAction) {
  const allEvents = [];

  for (const kind of ['creature', 'relic']) {
    const arr = kind === 'creature' ? G[SIDE].creatures : G[SIDE].relics;
    for (let i = 0; i < (arr || []).length; i++) {
      const inst = arr[i];
      if (!inst) continue;
      if (!hasActivatedAbility(inst)) continue;

      const check = canActivateAbility(SIDE, kind, i);
      if (!check.ok) continue;

      const def = getCardEffects(inst);
      const ability = def.activatedAbility;
      const reqs = getAbilityTargetRequirements(SIDE, kind, i);

      const targets = [];
      let canResolve = true;
      for (const req of reqs) {
        const t = pickTarget(req, ability.effects);
        if (!t) { canResolve = false; break; }
        targets.push(t);
      }
      if (!canResolve) continue;

      // Only activate if at least one effect targets the enemy or buffs AI
      const effects = ability.effects || [];
      const usefulEff = effects.find(e =>
        ['damage', 'destroy', 'addBleed', 'exhaust', 'overexhaust', 'discard'].includes(e.type)
        || (['buff', 'addPowerCounter', 'renew', 'heal', 'draw', 'gainGold', 'removeBleed'].includes(e.type))
      );
      if (!usefulEff) continue;

      const result = activateAbility(SIDE, kind, i, targets);
      if (result.ok) {
        allEvents.push({ type: 'ai-activate', name: inst.name });
        allEvents.push(...(result.events || []));
        if (onAction) onAction({ type: 'activate', card: inst, events: result.events });
      }
    }
  }

  return allEvents;
}

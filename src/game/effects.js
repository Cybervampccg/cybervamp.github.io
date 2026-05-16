// ─────────────────────────────────────────────────────────────
// effects.js — Effect interpreter for spells and abilities
// ─────────────────────────────────────────────────────────────

import { G, attachToken, removeToken } from './state.js';
import { grantKeyword, modifyBleedValue } from './keywords.js';
import { sacrificeCreature } from './sacrifice.js';
import { sacrificeRelic, ensureRelicSlots } from './relics.js';

export function targetTypeNeedsPick(targetType) {
  return [
    'creature', 'ownCreature', 'enemyCreature', 'creatureOrRelic', 'creatureOrPlayer',
    'relic', 'ownRelic', 'enemyRelic',
    'player', 'attackingCreature', 'blockingCreature',
  ].includes(targetType);
}

export function getValidTargets(targetType, sourceSide, filterFn) {
  const results = [];
  const otherSide = sourceSide === 'player' ? 'ai' : 'player';

  const pushCreatures = (side) => {
    (G[side]?.creatures || []).forEach((c, i) => {
      if (c) results.push({ kind: 'creature', side, slotIdx: i, _inst: c });
    });
  };
  const pushRelics = (side) => {
    ensureRelicSlots(side);
    (G[side]?.relics || []).forEach((r, i) => {
      if (r) results.push({ kind: 'relic', side, slotIdx: i, _inst: r });
    });
  };

  switch (targetType) {
    case 'creature':
      pushCreatures('player'); pushCreatures('ai'); break;
    case 'ownCreature':
      pushCreatures(sourceSide); break;
    case 'enemyCreature':
      pushCreatures(otherSide); break;
    case 'relic':
      pushRelics('player'); pushRelics('ai'); break;
    case 'ownRelic':
      pushRelics(sourceSide); break;
    case 'enemyRelic':
      pushRelics(otherSide); break;
    case 'creatureOrRelic':
      pushCreatures('player'); pushCreatures('ai');
      pushRelics('player'); pushRelics('ai'); break;
    case 'creatureOrPlayer':
      pushCreatures('player'); pushCreatures('ai');
      results.push({ kind: 'player', side: 'player' });
      results.push({ kind: 'player', side: 'ai' }); break;
    case 'player':
      results.push({ kind: 'player', side: 'player' });
      results.push({ kind: 'player', side: 'ai' }); break;
    case 'attackingCreature':
      ['player', 'ai'].forEach(side => {
        (G[side]?.creatures || []).forEach((c, i) => {
          if (c && c._attacking) results.push({ kind: 'creature', side, slotIdx: i, _inst: c });
        });
      }); break;
  }
  return filterFn ? results.filter(filterFn) : results;
}

export function runEffects(effects, ctx) {
  const events = [];
  for (const eff of effects) {
    if (eff.onlyIf && !eff.onlyIf(ctx)) continue;
    runOneEffect(eff, ctx, events);
  }
  return { ok: true, events };
}

function resolveTarget(effTarget, ctx) {
  const { sourceSide, targets } = ctx;
  const otherSide = sourceSide === 'player' ? 'ai' : 'player';
  if (!effTarget || effTarget === 'none') return null;
  if (effTarget === 'self') {
    const kind = ctx.sourceCard?.type === 'Relic' ? 'relic' : 'creature';
    return { kind, side: sourceSide, slotIdx: ctx.sourceSlotIdx };
  }
  if (effTarget === 'controller') return { kind: 'player', side: sourceSide };
  if (effTarget === 'opponent') return { kind: 'player', side: otherSide };
  if (effTarget === 'target') return (targets || [])[0] || null;
  if (effTarget === 'target2') return (targets || [])[1] || null;
  if (effTarget === 'targetController') {
    const t = (targets || [])[0];
    return t ? { kind: 'player', side: t.side } : null;
  }
  return null;
}

function runOneEffect(eff, ctx, events) {
  if (eff.skipIfMissing) {
    const t = resolveTarget(eff.target, ctx);
    if (!t && ['target', 'target2'].includes(eff.target)) return false;
  }
  const target = resolveTarget(eff.target, ctx);

  switch (eff.type) {
    case 'damage':              return effDamage(eff, target, events, ctx);
    case 'heal':                return effHeal(eff, target, events, ctx.sourceSide, ctx);
    case 'buff':                return effBuff(eff, target, events, ctx);
    case 'exhaust':             return effExhaust(eff, target, events, false);
    case 'overexhaust':         return effExhaust(eff, target, events, true);
    case 'renew':               return effRenew(eff, target, events);
    case 'destroy':             return effDestroy(eff, target, events);
    case 'draw':                return effDraw(eff, target, events, ctx.sourceSide, ctx);
    case 'discard':             return effDiscard(eff, target, events, ctx.sourceSide, ctx);
    case 'addBleed':            return effAddBleed(eff, target, events, ctx);
    case 'removeBleed':         return effRemoveBleed(eff, target, events, ctx);
    case 'addPowerCounter':     return effAddPowerCounter(eff, target, events, ctx);
    case 'returnToHand':        return effReturnToHand(eff, target, events);
    case 'all-creatures-damage':return effAllCreaturesDamage(eff, events, ctx.sourceSide);
    case 'all-creatures-buff':  return effAllCreaturesBuff(eff, events, ctx.sourceSide);
    case 'gainGold':            return effGainGold(eff, events, ctx.sourceSide, ctx);
    case 'damageEqualTargetPower': return effDamageEqualTargetPower(eff, target, events, ctx);
    case 'ifLastDestroyed':     return effIfLastDestroyed(eff, events, ctx);
    case 'destroySelf':         return effDestroySelf(eff, events, ctx);
    case 'destroyAllCreatures': return effDestroyAllCreatures(eff, events, ctx);
    case 'destroyAllCreaturesExceptSelf': return effDestroyAllCreaturesExceptSelf(eff, events, ctx);
    case 'damageBleedAndClear': return effDamageBleedAndClear(eff, target, events);
    case 'flagCantBeBlocked':   return effFlagCantBeBlocked(eff, target, events);
    case 'returnFromDiscard':   return effReturnFromDiscard(eff, events, ctx);
    case 'preventDamage':       return effPreventDamage(eff, target, events);
    case 'gainControl':         return effGainControl(eff, target, events, ctx);
    case 'createToken':         return effCreateToken(eff, target, events, ctx);
    case 'destroyToken':        return effDestroyToken(eff, target, events, ctx);
    case 'glimpse':             return effGlimpse(eff, events, ctx);
    case 'overexhaustOneCard':  return effOverexhaustOneCard(eff, events, ctx);
    // ─── New keyword/bleed-grant effects (keyword-patch session) ───
    case 'GRANT_KEYWORD':       return effGrantKeyword(eff, target, events, ctx);
    case 'MODIFY_BLEED_VALUE':  return effModifyBleedValue(eff, target, events, ctx);
    case 'custom':              return eff.fn ? !!eff.fn(ctx) : false;
    default:
      console.warn('[effects] unknown effect type:', eff.type);
      return false;
  }
}

// Resolve an amount that may be dynamic.
// eff.amount = number → return it
// eff.amountFrom = 'targetPower' → return target's power
// eff.amountFrom = 'target2Power' → return target2's power
function resolveAmount(eff, ctx) {
  if (typeof eff.amount === 'number') return eff.amount;
  if (eff.amountFrom === 'targetPower') {
    const t = (ctx.targets || [])[0];
    if (t?.kind === 'creature') {
      const c = G[t.side].creatures[t.slotIdx];
      return c ? (c.power || 0) : 0;
    }
    return 0;
  }
  if (eff.amountFrom === 'target2Power') {
    const t = (ctx.targets || [])[1];
    if (t?.kind === 'creature') {
      const c = G[t.side].creatures[t.slotIdx];
      return c ? (c.power || 0) : 0;
    }
    return 0;
  }
  return 1;
}

function effDamage(eff, target, events, ctx) {
  if (!target) return false;
  const amount = resolveAmount(eff, ctx);
  if (amount <= 0) return false;
  if (target.kind === 'player') {
    G[target.side].blood = Math.max(0, (G[target.side].blood || 0) - amount);
    events.push({ type: 'face-damage', defenderSide: target.side, damage: amount, attackerName: 'Spell' });
    return true;
  }
  if (target.kind === 'creature') {
    const c = G[target.side].creatures[target.slotIdx];
    if (!c) return false;
    c._damageTaken = (c._damageTaken || 0) + amount;
    events.push({ type: 'creature-damage', side: target.side, slotIdx: target.slotIdx, name: c.name, amount });
    if ((c.power || 0) - (c._damageTaken || 0) <= 0) {
      sacrificeCreature(target.side, target.slotIdx);
      events.push({ type: 'creature-destroyed', side: target.side, name: c.name });
      // Record for ifLastDestroyed effect chains
      if (ctx) ctx._lastDestroyedSide = target.side;
    }
    return true;
  }
  if (target.kind === 'relic') {
    const r = G[target.side].relics?.[target.slotIdx];
    if (!r) return false;
    sacrificeRelic(target.side, target.slotIdx);
    events.push({ type: 'relic-destroyed', side: target.side, name: r.name });
    if (ctx) ctx._lastDestroyedSide = target.side;
    return true;
  }
  return false;
}

function effHeal(eff, target, events, sourceSide, ctx) {
  const t = target || { kind: 'player', side: sourceSide };
  if (t.kind !== 'player') return false;
  const amount = resolveAmount(eff, ctx);
  G[t.side].blood = (G[t.side].blood || 0) + amount;
  events.push({ type: 'heal', side: t.side, amount });
  return true;
}

function effBuff(eff, target, events, ctx) {
  if (!target || target.kind !== 'creature') return false;
  const c = G[target.side].creatures[target.slotIdx];
  if (!c) return false;
  const amount = (typeof eff.power === 'number') ? eff.power : resolveAmount(eff, ctx);
  c.power = (c.power || 0) + amount;
  if (eff.duration === 'permanent') {
    c._permanentPowerBonus = (c._permanentPowerBonus || 0) + amount;
  } else {
    c._tempPowerBonus = (c._tempPowerBonus || 0) + amount;
    c._tempBonusExpiresAt = 'endOfTurn';
  }
  events.push({ type: 'buff', side: target.side, slotIdx: target.slotIdx, name: c.name, power: amount });
  return true;
}

function effExhaust(eff, target, events, over) {
  if (!target) return false;
  const arr = target.kind === 'creature' ? G[target.side].creatures : G[target.side].relics;
  const x = arr?.[target.slotIdx];
  if (!x) return false;
  if (over) x.overexhausted = true;
  else if (x.exhausted) x.overexhausted = true;
  else x.exhausted = true;
  events.push({ type: over ? 'overexhaust' : 'exhaust', side: target.side, name: x.name });
  return true;
}

function effRenew(eff, target, events) {
  if (!target) return false;
  const arr = target.kind === 'creature' ? G[target.side].creatures : G[target.side].relics;
  const x = arr?.[target.slotIdx];
  if (!x) return false;
  delete x.exhausted;
  delete x.overexhausted;
  events.push({ type: 'renew', side: target.side, name: x.name });
  return true;
}

function effDestroy(eff, target, events) {
  if (!target) return false;
  if (target.kind === 'creature') {
    const c = G[target.side].creatures[target.slotIdx];
    if (!c) return false;
    sacrificeCreature(target.side, target.slotIdx);
    events.push({ type: 'creature-destroyed', side: target.side, name: c.name });
    return true;
  }
  if (target.kind === 'relic') {
    const r = G[target.side].relics?.[target.slotIdx];
    if (!r) return false;
    sacrificeRelic(target.side, target.slotIdx);
    events.push({ type: 'relic-destroyed', side: target.side, name: r.name });
    return true;
  }
  return false;
}

function effDraw(eff, target, events, sourceSide, ctx) {
  const t = target || { kind: 'player', side: sourceSide };
  if (t.kind !== 'player') return false;
  const amount = resolveAmount(eff, ctx);
  const deck = G[t.side].deck || [];
  const hand = G[t.side].hand || [];
  let drawn = 0;
  for (let i = 0; i < amount && deck.length > 0; i++) {
    hand.push(deck.shift());
    drawn++;
  }
  events.push({ type: 'draw', side: t.side, amount: drawn });
  return drawn > 0;
}

function effDiscard(eff, target, events, sourceSide, ctx) {
  const t = target || { kind: 'player', side: sourceSide === 'player' ? 'ai' : 'player' };
  if (t.kind !== 'player') return false;
  const amount = resolveAmount(eff, ctx);
  const hand = G[t.side].hand || [];
  const discard = G[t.side].discard || (G[t.side].discard = []);
  let discarded = 0;
  for (let i = 0; i < amount && hand.length > 0; i++) {
    const idx = Math.floor(Math.random() * hand.length);
    discard.push(hand.splice(idx, 1)[0]);
    discarded++;
  }
  events.push({ type: 'discard', side: t.side, amount: discarded });
  return discarded > 0;
}

function effAddBleed(eff, target, events, ctx) {
  if (!target || target.kind !== 'player') return false;
  const amount = resolveAmount(eff, ctx);
  G[target.side].bleedPool = (G[target.side].bleedPool || 0) + amount;
  events.push({ type: 'bleed-add', side: target.side, amount });
  return true;
}

function effRemoveBleed(eff, target, events, ctx) {
  if (!target || target.kind !== 'player') return false;
  const amount = resolveAmount(eff, ctx);
  const current = G[target.side].bleedPool || 0;
  const removed = Math.min(amount, current);
  G[target.side].bleedPool = current - removed;
  events.push({ type: 'bleed-remove', side: target.side, amount: removed });
  return removed > 0;
}

function effAddPowerCounter(eff, target, events, ctx) {
  if (!target || target.kind !== 'creature') return false;
  const c = G[target.side].creatures[target.slotIdx];
  if (!c) return false;
  const amount = resolveAmount(eff, ctx);
  c.power = (c.power || 0) + amount;
  c._permanentPowerBonus = (c._permanentPowerBonus || 0) + amount;
  events.push({ type: 'power-counter', side: target.side, name: c.name, amount });
  return true;
}

function effReturnToHand(eff, target, events) {
  if (!target || target.kind !== 'creature') return false;
  const c = G[target.side].creatures[target.slotIdx];
  if (!c) return false;
  G[target.side].creatures[target.slotIdx] = null;
  delete c.exhausted; delete c.overexhausted;
  delete c._tempPowerBonus; delete c._tempBonusExpiresAt;
  delete c._damageTaken; delete c._attacking; delete c._blockedBy;
  if (c._permanentPowerBonus) {
    c.power = (c.power || 0) - c._permanentPowerBonus;
    delete c._permanentPowerBonus;
  }
  (G[target.side].hand || []).push(c);
  events.push({ type: 'return-to-hand', side: target.side, name: c.name });
  return true;
}

function effAllCreaturesDamage(eff, events, sourceSide) {
  const filter = eff.filter || 'enemy';
  const sides = filter === 'enemy' ? [sourceSide === 'player' ? 'ai' : 'player']
              : filter === 'own'   ? [sourceSide]
              : ['player', 'ai'];
  let any = false;
  for (const side of sides) {
    (G[side]?.creatures || []).forEach((c, i) => {
      if (!c) return;
      const t = { kind: 'creature', side, slotIdx: i };
      if (effDamage({ amount: eff.amount || 1 }, t, events)) any = true;
    });
  }
  return any;
}

function effAllCreaturesBuff(eff, events, sourceSide) {
  const filter = eff.filter || 'own';
  const sides = filter === 'enemy' ? [sourceSide === 'player' ? 'ai' : 'player']
              : filter === 'own'   ? [sourceSide]
              : ['player', 'ai'];
  let any = false;
  for (const side of sides) {
    (G[side]?.creatures || []).forEach((c, i) => {
      if (!c) return;
      const t = { kind: 'creature', side, slotIdx: i };
      if (effBuff({ power: eff.power || 1, duration: eff.duration || 'endOfTurn' }, t, events)) any = true;
    });
  }
  return any;
}

function effGainGold(eff, events, sourceSide, ctx) {
  const amount = resolveAmount(eff, ctx);
  G[sourceSide].gold = (G[sourceSide].gold || 0) + amount;
  events.push({ type: 'gain-gold', side: sourceSide, amount });
  return true;
}

// ─── New effect types ───

// damageEqualTargetPower — deals damage to target equal to a SOURCE creature's power
// Used by Blending In: "Exhaust own creature, deal damage = its power to target creature"
// The exhausted source is targets[0], the damage target is targets[1].
function effDamageEqualTargetPower(eff, target, events, ctx) {
  const sourceCreatureTarget = (ctx.targets || [])[0];
  if (!sourceCreatureTarget || sourceCreatureTarget.kind !== 'creature') return false;
  const sourceC = G[sourceCreatureTarget.side].creatures[sourceCreatureTarget.slotIdx];
  if (!sourceC) return false;
  const damageAmount = sourceC.power || 0;
  // Exhaust the source creature as cost
  if (eff.exhaustSource) {
    if (sourceC.exhausted) sourceC.overexhausted = true;
    else sourceC.exhausted = true;
    events.push({ type: 'exhaust', side: sourceCreatureTarget.side, name: sourceC.name });
  }
  // Damage the secondary target
  const damageTarget = (ctx.targets || [])[1];
  if (!damageTarget) return false;
  return effDamage({ amount: damageAmount }, damageTarget, events, ctx);
}

// ifLastDestroyed — runs follow-up effects only if the previous effect destroyed something
// Used by Blending In: "If destroyed → opp gets 1 bleed + you draw 1"
function effIfLastDestroyed(eff, events, ctx) {
  if (!ctx._lastDestroyedSide) return false;
  // Run the nested effects
  for (const inner of (eff.then || [])) {
    runOneEffect(inner, ctx, events);
  }
  return true;
}

// destroySelf — destroys the card whose ability is being activated
function effDestroySelf(eff, events, ctx) {
  const side = ctx.sourceSide;
  const slotIdx = ctx.sourceSlotIdx;
  if (slotIdx === undefined || slotIdx === null) return false;
  // Try creature first, then relic
  if (ctx.sourceCard?.type === 'Relic' || ctx.sourceCard?.type === 'relic') {
    const r = G[side].relics?.[slotIdx];
    if (r) {
      sacrificeRelic(side, slotIdx);
      events.push({ type: 'relic-destroyed', side, name: r.name });
      return true;
    }
  } else {
    const c = G[side].creatures?.[slotIdx];
    if (c) {
      sacrificeCreature(side, slotIdx);
      events.push({ type: 'creature-destroyed', side, name: c.name });
      return true;
    }
  }
  return false;
}

// destroyAllCreatures — wipes all creatures on board
function effDestroyAllCreatures(eff, events, ctx) {
  let any = false;
  for (const side of ['player', 'ai']) {
    (G[side]?.creatures || []).forEach((c, i) => {
      if (!c) return;
      sacrificeCreature(side, i);
      events.push({ type: 'creature-destroyed', side, name: c.name });
      any = true;
    });
  }
  return any;
}

// destroyAllCreaturesExceptSelf — wipes all except the activating creature
function effDestroyAllCreaturesExceptSelf(eff, events, ctx) {
  const protectedSide = ctx.sourceSide;
  const protectedSlot = ctx.sourceSlotIdx;
  let any = false;
  for (const side of ['player', 'ai']) {
    (G[side]?.creatures || []).forEach((c, i) => {
      if (!c) return;
      if (side === protectedSide && i === protectedSlot) return;
      sacrificeCreature(side, i);
      events.push({ type: 'creature-destroyed', side, name: c.name });
      any = true;
    });
  }
  return any;
}

// damageBleedAndClear — clears target player's bleed pool and damages them by that amount
function effDamageBleedAndClear(eff, target, events) {
  if (!target || target.kind !== 'player') return false;
  const bleed = G[target.side].bleedPool || 0;
  if (bleed <= 0) {
    events.push({ type: 'bleed-add', side: target.side, amount: 0 });
    return false;
  }
  G[target.side].bleedPool = 0;
  G[target.side].blood = Math.max(0, (G[target.side].blood || 0) - bleed);
  events.push({ type: 'bleed-remove', side: target.side, amount: bleed });
  events.push({ type: 'face-damage', defenderSide: target.side, damage: bleed, attackerName: 'Bleed conversion' });
  return true;
}

// flagCantBeBlocked — sets a flag on target creature for can't-be-blocked this turn
function effFlagCantBeBlocked(eff, target, events) {
  if (!target || target.kind !== 'creature') return false;
  const c = G[target.side].creatures[target.slotIdx];
  if (!c) return false;
  c._cantBeBlocked = true;
  c._cantBeBlockedExpiresEndOfTurn = true;
  events.push({ type: 'flag', side: target.side, name: c.name, flag: 'unblockable' });
  return true;
}

// returnFromDiscard — return a card from owner's discard to their hand (random for now)
function effReturnFromDiscard(eff, events, ctx) {
  const side = ctx.sourceSide;
  const discard = G[side]?.discard || [];
  if (discard.length === 0) return false;
  // Pop the most recently added (top)
  const card = discard.pop();
  (G[side].hand || (G[side].hand = [])).push(card);
  events.push({ type: 'return-to-hand', side, name: card.name });
  return true;
}

// preventDamage — prevent up to N damage to target (visual flag only)
function effPreventDamage(eff, target, events) {
  if (!target) return false;
  // Just log it for now; full damage prevention requires combat-system integration.
  events.push({ type: 'prevent-damage', amount: eff.amount || 0 });
  return true;
}

// overexhaustOneCard — overexhaust the first non-overexhausted permanent the target side controls.
// Used by Grimoire Scribe: on direct damage, defender must overexhaust a card.
// eff.side: 'opponent' (default) | 'controller'
function effOverexhaustOneCard(eff, events, ctx) {
  const side = (eff.side === 'controller') ? ctx.sourceSide
             : (ctx.sourceSide === 'player' ? 'ai' : 'player');
  // Prefer to overexhaust a creature, then a relic
  for (const arr of [G[side]?.creatures || [], G[side]?.relics || []]) {
    for (const x of arr) {
      if (!x || x.overexhausted) continue;
      if (x.exhausted) x.overexhausted = true;
      else x.exhausted = true;
      events.push({ type: 'overexhaust', side, name: x.name, source: 'GrimoireScribe' });
      return true;
    }
  }
  return false;
}

// gainControl — steal a creature from the opponent and place it on your side.
//
// Effect shape: { type: 'gainControl', target: 'target' }
//
// The stolen creature enters exhausted (can't attack this turn).
// If controller has no empty creature slot, the effect fails silently.
function effGainControl(eff, target, events, ctx) {
  if (!target || target.kind !== 'creature') return false;
  const fromSide = target.side;
  const fromSlot = target.slotIdx;
  const toSide = ctx.sourceSide;
  if (fromSide === toSide) return false; // can't steal your own

  const inst = G[fromSide]?.creatures?.[fromSlot];
  if (!inst) return false;

  const toSlots = G[toSide].creatures;
  const emptySlot = toSlots.findIndex(s => s === null);
  if (emptySlot < 0) return false; // no empty slot

  G[fromSide].creatures[fromSlot] = null;
  G[toSide].creatures[emptySlot] = inst;
  inst.owner = toSide;
  inst.slotIdx = emptySlot;
  inst.location = 'creatures';
  inst.exhausted = true; // stolen creature enters exhausted

  events.push({ type: 'gain-control', fromSide, fromSlot, toSide, toSlot: emptySlot, name: inst.name });
  return true;
}

// ───────── Token effects ─────────

// createToken — attach one or more tokens of tokenType to a host creature.
//
// Effect shape:
//   { type: 'createToken', tokenType: 'Bat'|'Raven'|'Wolf'|'Zombie', amount: N, host: 'self'|undefined }
//
// host: 'self'  → host is the source creature (ctx.sourceSide + ctx.sourceSlotIdx)
// host: unset   → host is resolved from eff.target (e.g. 'target' → first picked creature)
function effCreateToken(eff, target, events, ctx) {
  let host = null;
  if (eff.host === 'self') {
    if (ctx.sourceSlotIdx != null) {
      host = G[ctx.sourceSide]?.creatures?.[ctx.sourceSlotIdx] || null;
    }
  } else if (eff.host === 'firstOwnCreature') {
    // Used by ON_DEATH effects — source is dying, pick first OTHER own creature
    host = (G[ctx.sourceSide]?.creatures || []).find(c => c && c !== ctx.sourceCard) || null;
  } else if (target?.kind === 'creature') {
    host = G[target.side].creatures[target.slotIdx];
  }
  if (!host) return false;

  const tokenType = eff.tokenType;
  if (!tokenType) return false;
  const amount = eff.amount || 1;
  let created = 0;
  for (let i = 0; i < amount; i++) {
    if (attachToken(host, tokenType)) created++;
    else break; // token cap (5) hit
  }
  if (created === 0) return false;

  const side = eff.host === 'self' ? ctx.sourceSide : (target?.side || ctx.sourceSide);
  events.push({ type: 'token-created', side, hostName: host.name, tokenType, amount: created });
  return true;
}

// destroyToken — remove one token of tokenType from a host creature and exile it.
//
// Effect shape:
//   { type: 'destroyToken', tokenType: 'Bat'|'Raven'|'Wolf'|'Zombie'|'any', host: 'self'|undefined }
//
// tokenType 'any' removes the first token in the array regardless of type.
function effDestroyToken(eff, target, events, ctx) {
  let host = null;
  if (eff.host === 'self') {
    if (ctx.sourceSlotIdx != null) {
      host = G[ctx.sourceSide]?.creatures?.[ctx.sourceSlotIdx] || null;
    }
  } else if (target?.kind === 'creature') {
    host = G[target.side].creatures[target.slotIdx];
  }
  if (!host) return false;

  const tokenType = eff.tokenType || 'any';
  let removed = false;
  if (tokenType === 'any') {
    if (host.tokens.length > 0) {
      host.tokens.splice(0, 1);
      removed = true;
    }
  } else {
    removed = removeToken(host, tokenType);
  }
  if (!removed) return false;

  const side = eff.host === 'self' ? ctx.sourceSide : (target?.side || ctx.sourceSide);
  events.push({ type: 'token-destroyed', side, hostName: host.name, tokenType });
  return true;
}

// glimpse — reveal top N cards of controller's deck, keep 1, shuffle rest to bottom.
//
// Effect shape:
//   { type: 'glimpse', amount: N }
//   { type: 'glimpse', amountFrom: 'ownRelicCount' }
//
// Per RULES §14.4: player picks 1 to draw; remaining go to bottom in random order.
// Auto-picks first card for AI (and as a placeholder for human players until UI is built).
// Emits a 'glimpse' event with the revealed card names so UI can later intercept.
function effGlimpse(eff, events, ctx) {
  const side = ctx.sourceSide;
  const deck = G[side]?.deck;
  const hand = G[side]?.hand;
  if (!deck || deck.length === 0) return false;

  let amount = eff.amount || 1;
  if (eff.amountFrom === 'ownRelicCount') {
    amount = (G[side].relics || []).filter(r => r !== null).length;
    if (amount === 0) return false;
  }

  const take = Math.min(amount, deck.length);
  const revealed = [];
  for (let i = 0; i < take; i++) {
    revealed.push(deck.pop()); // pop = top of deck
  }

  events.push({ type: 'glimpse', side, cards: revealed.map(c => c.name), amount: take });

  // Keep first card (auto-pick; UI can override this later by intercepting the event)
  const kept = revealed.shift();
  kept.location = 'hand';
  hand.push(kept);
  events.push({ type: 'draw', side, amount: 1 });

  // Shuffle remaining to random positions near bottom of deck
  for (const card of revealed) {
    const maxInsert = Math.floor(deck.length / 2) + 1;
    const pos = Math.floor(Math.random() * maxInsert);
    deck.splice(pos, 0, card);
  }
  return true;
}

// ───────── New effects added by keyword-patch session ─────────

// GRANT_KEYWORD — adds a keyword to a target creature's _grantedKeywords array.
//
// Effect shape:
//   { type: 'GRANT_KEYWORD', keyword: 'BREACH', duration: 'endOfTurn', target: 'target' }
//
// keyword: string like 'HASTE', 'BREACH', 'TIRELESS', 'SIPHON', 'BLEED:1'
// duration: 'endOfTurn' (default) or 'permanent'
//
// Per RULES §7: granted keywords behave identically to printed keywords for
// combat math purposes. Combat reads keywords via getKeywords(inst) which
// returns the union of both.
//
// Per RULES §5 "Reset Rule": granted keywords are stripped when the card
// leaves play (anything to discard reverts to printed state).
function effGrantKeyword(eff, target, events, ctx) {
  if (!target || target.kind !== 'creature') return false;
  const inst = G[target.side].creatures[target.slotIdx];
  if (!inst) return false;
  const keyword = eff.keyword;
  const duration = eff.duration || 'endOfTurn';
  if (!keyword) return false;
  grantKeyword(inst, keyword, duration);
  events.push({
    type: 'grant-keyword',
    side: target.side,
    name: inst.name,
    keyword,
    duration,
  });
  return true;
}

// MODIFY_BLEED_VALUE — modifies a creature's BLEED X output via bonus/multiplier.
//
// Effect shape:
//   { type: 'MODIFY_BLEED_VALUE', op: 'multiply', value: 2, duration: 'endOfTurn', target: 'target' }
//   { type: 'MODIFY_BLEED_VALUE', op: 'add', value: 1, target: 'target' }
//
// op: 'add' (additive bonus, stacks) | 'multiply' (multiplicative)
// value: number
// duration: 'endOfTurn' (default; cleared by renewPermanents) | 'permanent'
//
// Used by:
//   • Blade Silhouette: { op: 'multiply', value: 2 }  (doubles bleed)
//   • "Bleed +1 until end of turn" effects on creatures that may have NO printed
//     BLEED — use { op: 'add', value: 1 } AND also grant 'BLEED:0' so the bonus
//     has something to modify. (Implementation note: getKeywordValue treats
//     BLEED:0 as "present, value 0" so + bonus works correctly.)
//   Alternative simpler form for "Bleed +1": just use GRANT_KEYWORD 'BLEED:1' —
//   the per-instance sum will add it. Both paths produce the same effective value.
function effModifyBleedValue(eff, target, events, ctx) {
  if (!target || target.kind !== 'creature') return false;
  const inst = G[target.side].creatures[target.slotIdx];
  if (!inst) return false;
  const op = eff.op || 'add';
  const value = typeof eff.value === 'number' ? eff.value : 1;
  modifyBleedValue(inst, op, value);
  events.push({
    type: 'modify-bleed-value',
    side: target.side,
    name: inst.name,
    op,
    value,
  });
  return true;
}

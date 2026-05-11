// ─────────────────────────────────────────────────────────────
// effects.js — Effect interpreter for spells and abilities
// ─────────────────────────────────────────────────────────────

import { G } from './state.js';
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
    case 'damage':              return effDamage(eff, target, events);
    case 'heal':                return effHeal(eff, target, events, ctx.sourceSide);
    case 'buff':                return effBuff(eff, target, events);
    case 'exhaust':             return effExhaust(eff, target, events, false);
    case 'overexhaust':         return effExhaust(eff, target, events, true);
    case 'renew':               return effRenew(eff, target, events);
    case 'destroy':             return effDestroy(eff, target, events);
    case 'draw':                return effDraw(eff, target, events, ctx.sourceSide);
    case 'discard':             return effDiscard(eff, target, events, ctx.sourceSide);
    case 'addBleed':            return effAddBleed(eff, target, events);
    case 'removeBleed':         return effRemoveBleed(eff, target, events);
    case 'addPowerCounter':     return effAddPowerCounter(eff, target, events);
    case 'returnToHand':        return effReturnToHand(eff, target, events);
    case 'all-creatures-damage':return effAllCreaturesDamage(eff, events, ctx.sourceSide);
    case 'all-creatures-buff':  return effAllCreaturesBuff(eff, events, ctx.sourceSide);
    case 'gainGold':            return effGainGold(eff, events, ctx.sourceSide);
    case 'custom':              return eff.fn ? !!eff.fn(ctx) : false;
    default:
      console.warn('[effects] unknown effect type:', eff.type);
      return false;
  }
}

function effDamage(eff, target, events) {
  if (!target) return false;
  const amount = eff.amount || 1;
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
    }
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

function effHeal(eff, target, events, sourceSide) {
  const t = target || { kind: 'player', side: sourceSide };
  if (t.kind !== 'player') return false;
  const amount = eff.amount || 1;
  G[t.side].blood = (G[t.side].blood || 0) + amount;
  events.push({ type: 'heal', side: t.side, amount });
  return true;
}

function effBuff(eff, target, events) {
  if (!target || target.kind !== 'creature') return false;
  const c = G[target.side].creatures[target.slotIdx];
  if (!c) return false;
  const amount = eff.power || 0;
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

function effDraw(eff, target, events, sourceSide) {
  const t = target || { kind: 'player', side: sourceSide };
  if (t.kind !== 'player') return false;
  const amount = eff.amount || 1;
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

function effDiscard(eff, target, events, sourceSide) {
  const t = target || { kind: 'player', side: sourceSide === 'player' ? 'ai' : 'player' };
  if (t.kind !== 'player') return false;
  const amount = eff.amount || 1;
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

function effAddBleed(eff, target, events) {
  if (!target || target.kind !== 'player') return false;
  const amount = eff.amount || 1;
  G[target.side].bleedPool = (G[target.side].bleedPool || 0) + amount;
  events.push({ type: 'bleed-add', side: target.side, amount });
  return true;
}

function effRemoveBleed(eff, target, events) {
  if (!target || target.kind !== 'player') return false;
  const amount = eff.amount || 1;
  const current = G[target.side].bleedPool || 0;
  const removed = Math.min(amount, current);
  G[target.side].bleedPool = current - removed;
  events.push({ type: 'bleed-remove', side: target.side, amount: removed });
  return removed > 0;
}

function effAddPowerCounter(eff, target, events) {
  if (!target || target.kind !== 'creature') return false;
  const c = G[target.side].creatures[target.slotIdx];
  if (!c) return false;
  const amount = eff.amount || 1;
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

function effGainGold(eff, events, sourceSide) {
  G[sourceSide].gold = (G[sourceSide].gold || 0) + (eff.amount || 1);
  events.push({ type: 'gain-gold', side: sourceSide, amount: eff.amount });
  return true;
}

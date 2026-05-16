// Pitch — discard a card for its alternate (pitch) effect
import { G, drawCards } from './state.js';

const PITCH_EFFECTS = {
  'Left Behind':          [{ type: 'draw',        target: 'self',     amount: 1 }],
  'Grid Hack Wallbuster': [{ type: 'draw',        target: 'self',     amount: 1 }],
  'Blade Silhouette':     [{ type: 'gain-gold',   target: 'self',     amount: 1 }],
  'Marble Ward':          [{ type: 'heal',        target: 'self',     amount: 2 }],
  'Dark Reach':           [
    { type: 'face-damage', target: 'opponent', amount: 1 },
    { type: 'heal',        target: 'self',     amount: 1 },
  ],
  'Shadowstalk Burst':    [{ type: 'draw',        target: 'self',     amount: 1 }],
};

export function hasPitchEffect(inst) {
  return Boolean(inst?.name && inst.name in PITCH_EFFECTS);
}

export function pitchCard(side, instId) {
  const hand = G[side]?.hand;
  if (!Array.isArray(hand)) return { ok: false, error: 'No hand found' };

  const idx = hand.findIndex(c => c.instId === instId);
  if (idx === -1) return { ok: false, error: 'Card not in hand' };

  const inst = hand[idx];
  if (!hasPitchEffect(inst)) return { ok: false, error: `${inst.name} has no pitch effect` };

  if (G.activePlayer !== side) return { ok: false, error: 'Not your turn' };
  if (G.phase !== 'renew' && G.phase !== 'main') return { ok: false, error: 'Cannot pitch right now' };

  // Remove from hand, move to discard
  hand.splice(idx, 1);
  inst.location = 'discard';
  if (!Array.isArray(G[side].discard)) G[side].discard = [];
  G[side].discard.push(inst);

  const opponent = side === 'player' ? 'ai' : 'player';
  const effects = PITCH_EFFECTS[inst.name];
  const events = [];

  for (const fx of effects) {
    const t = fx.target === 'self' ? side : opponent;
    switch (fx.type) {
      case 'draw': {
        const drawn = drawCards(t, fx.amount);
        events.push({ type: 'draw', side: t, amount: drawn.length });
        break;
      }
      case 'gain-gold':
        G[t].gold = (G[t].gold || 0) + fx.amount;
        events.push({ type: 'gain-gold', side: t, amount: fx.amount });
        break;
      case 'heal':
        G[t].blood = (G[t].blood || 0) + fx.amount;
        events.push({ type: 'heal', side: t, amount: fx.amount });
        break;
      case 'face-damage':
        G[t].blood = Math.max(0, (G[t].blood || 0) - fx.amount);
        if (G[t].blood <= 0) G.winner = t === 'player' ? 'ai' : 'player';
        events.push({ type: 'face-damage', defenderSide: t, damage: fx.amount, attackerName: inst.name });
        break;
    }
  }

  return { ok: true, inst, events };
}

// ─────────────────────────────────────────────────────────────
// Deck building helpers
//
// For Session A, we generate a simple legal 40-card deck for a faction
// using whatever cards exist in cards.js. Strategy: pick a balanced
// distribution (creatures + spells + relics) preferring lower-cost cards.
//
// Real deck-building UI comes much later. This is just enough to
// initialize a battle for testing.
// ─────────────────────────────────────────────────────────────

import { CARDS_BY_FACTION } from './cards.js';
import { makeInst } from './state.js';

const DECK_SIZE = 40;

export function buildDefaultDeck(faction, owner) {
  const factionCards = CARDS_BY_FACTION[faction] || [];
  const colorless = CARDS_BY_FACTION.Colorless || [];

  // Filter out token templates (no cost) and Sire Lords (1 max)
  const eligibleFaction = factionCards.filter(c => c.goldCost > 0 || c.bloodCost > 0 || c.type === 'Spell');
  const eligibleColorless = colorless.filter(c => c.goldCost > 0 || c.bloodCost > 0);

  // Separate by type
  const creatures = eligibleFaction.filter(c => c.type === 'Creature' && c.subtype !== 'Unique');
  const spells = eligibleFaction.filter(c => c.type === 'Spell');
  const relics = eligibleFaction.filter(c => c.type === 'Relic');
  const sireLords = eligibleFaction.filter(c => c.subtype === 'Unique');

  // Target distribution: ~22 creatures, ~12 spells, ~5 relics, 1 Sire Lord
  const deck = [];

  // 1 Sire Lord
  if (sireLords.length > 0) {
    deck.push(makeInst(sireLords[0].id, owner));
  }

  // 22 creatures, prefer lower cost (curve)
  const sortedCreatures = [...creatures].sort((a, b) => (a.goldCost + a.bloodCost) - (b.goldCost + b.bloodCost));
  for (let i = 0; i < 22 && i < sortedCreatures.length * 3; i++) {
    const card = sortedCreatures[i % sortedCreatures.length];
    deck.push(makeInst(card.id, owner));
  }

  // 12 spells
  for (let i = 0; i < 12 && spells.length > 0; i++) {
    const card = spells[i % spells.length];
    deck.push(makeInst(card.id, owner));
  }

  // 5 relics
  for (let i = 0; i < 5 && relics.length > 0; i++) {
    const card = relics[i % relics.length];
    deck.push(makeInst(card.id, owner));
  }

  // Fill any remaining slots with colorless or extra creatures
  while (deck.length < DECK_SIZE) {
    const pool = eligibleColorless.length > 0 ? eligibleColorless : sortedCreatures;
    const card = pool[deck.length % pool.length];
    if (!card) break;
    deck.push(makeInst(card.id, owner));
  }

  // Trim if overshot
  return deck.slice(0, DECK_SIZE);
}

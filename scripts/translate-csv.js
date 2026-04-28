#!/usr/bin/env node
// Translate cards.csv → cards.js for Cybervamp v2.
// Cost translation rules:
//   - Creatures/Relics: G pips → goldCost; faction pips (R/W/B/P) → bloodCost
//   - Spells: faction pips → bloodCost; no goldCost
//   - Colorless cards: any G/colorless pips → goldCost
// Also produces flagged.json with cards needing manual review.

import fs from 'node:fs';
import path from 'node:path';

const CSV_PATH = process.argv[2] || '/mnt/user-data/uploads/cards.csv';
const OUT_DIR = '/home/claude/scaffold/src/game';
const FLAGGED_PATH = '/home/claude/scaffold/cards-flagged.json';

// Naive CSV parser that handles quoted fields with commas inside.
function parseCSV(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue; }
      if (ch === '"') { inQuotes = false; i++; continue; }
      field += ch; i++;
    } else {
      if (ch === '"') { inQuotes = true; i++; continue; }
      if (ch === ',') { row.push(field); field = ''; i++; continue; }
      if (ch === '\r') { i++; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
      field += ch; i++;
    }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const csv = fs.readFileSync(CSV_PATH, 'utf8');
const rows = parseCSV(csv);

// Skip header row + the empty separator row
const header = rows[0];
const dataRows = rows.slice(2).filter(r => r[1] && r[1].trim() && r[5] && r[5].trim());

// Column indices based on the header
const colMap = {};
header.forEach((h, idx) => { colMap[h.trim()] = idx; });

const get = (row, name) => row[colMap[name]] || '';

const cards = [];
const flagged = [];

let nextId = 1;

for (const row of dataRows) {
  const color    = get(row, 'Color').trim();
  const type     = get(row, 'Type').trim();
  const subtype  = get(row, 'Subtype').trim();
  const name     = get(row, 'Card Name').trim();
  const rarity   = get(row, 'Rarity').trim();
  const cost     = get(row, 'Mana Cost').trim();
  const power    = get(row, 'Power').trim();
  const abilities= get(row, 'Abilities').trim();
  const flavor   = get(row, 'Flavor Text').trim();
  const imageUrl = get(row, 'Image URL').trim();

  if (!name) continue;

  // Translate cost from pip notation
  // Pips in CSV: G (gold/colorless), R/W/B/P (faction blood)
  let goldCost = 0;
  let bloodCost = 0;
  for (const ch of cost) {
    if (ch === 'G') goldCost++;
    else if (ch === 'R' || ch === 'W' || ch === 'B' || ch === 'P') bloodCost++;
  }

  // Spells: per design rules, pip count = blood cost regardless of letter
  // (Creatures/Relics: G = gold, faction letter = blood)
  // The CSV encodes spells as faction pips (RR/PP/BB) which already bloodCost'd above.
  // For spells, if any G pips snuck in, push them to bloodCost (rare).
  if (type === 'Spell') {
    bloodCost += goldCost;
    goldCost = 0;
  }

  const card = {
    id: nextId++,
    name,
    faction: color,
    type,
    subtype: subtype || null,
    rarity,
    goldCost,
    bloodCost,
    power: power && type === 'Creature' ? parseInt(power) : null,
    abilities: abilities || null,
    flavor: flavor || null,
    image: imageUrl || null,
  };

  // Flag suspicious cards
  const flags = [];
  if (goldCost > 10) flags.push(`goldCost ${goldCost} exceeds turn-10 cap`);
  if (bloodCost > 7) flags.push(`bloodCost ${bloodCost} dangerously high`);
  if (type === 'Creature' && card.power === null) flags.push('creature has no power');
  if (type === 'Spell' && goldCost > 0) flags.push('spell has goldCost (should be all blood)');
  if (cost === '' && type !== 'Land') flags.push('no cost on non-land');
  if (!imageUrl) flags.push('missing image URL');

  if (flags.length) {
    flagged.push({ name, id: card.id, flags, originalCost: cost });
  }

  cards.push(card);
}

// Write cards.js as ES module
const jsContent = `// Auto-generated from cards.csv on ${new Date().toISOString()}
// To regenerate: node scripts/translate-csv.js
//
// Card schema:
//   id          — unique numeric ID (1-based, stable)
//   name        — display name
//   faction     — Red / White / Black / Purple / Colorless
//   type        — Creature / Spell / Relic
//   subtype     — null or string (e.g. "Unique")
//   rarity      — Common / Uncommon / Rare / Mythic Rare
//   goldCost    — integer Gold needed
//   bloodCost   — integer Blood (HP) needed
//   power       — integer power for creatures, null otherwise
//   abilities   — ability text, parsed at runtime by keyword module
//   flavor      — flavor text
//   image       — full image URL

export const CARDS = ${JSON.stringify(cards, null, 2)};

// Quick lookup by ID
export const CARDS_BY_ID = Object.fromEntries(CARDS.map(c => [c.id, c]));

// Filter helpers
export const CARDS_BY_FACTION = {
  Red:        CARDS.filter(c => c.faction === 'Red'),
  White:      CARDS.filter(c => c.faction === 'White'),
  Black:      CARDS.filter(c => c.faction === 'Black'),
  Purple:     CARDS.filter(c => c.faction === 'Purple'),
  Colorless:  CARDS.filter(c => c.faction === 'Colorless'),
};
`;

fs.writeFileSync(path.join(OUT_DIR, 'cards.js'), jsContent);
fs.writeFileSync(FLAGGED_PATH, JSON.stringify(flagged, null, 2));

console.log(`Wrote ${cards.length} cards to ${path.join(OUT_DIR, 'cards.js')}`);
console.log(`${flagged.length} cards flagged for review (see cards-flagged.json)`);

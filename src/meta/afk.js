// AFK Resource Engine
// Full implementation per design doc 03-afk-math.md

import { loadMeta, saveMeta } from './meta-state.js';
import { TERRITORIES } from './territory.js';

const HOUR_MS = 3600000;
const AFK_CAP_HOURS = 8;

const BASE_RATE = {
  mine: 60,   // ore/hr at level 1, 100% domination, 1.0 bias
  bank: 50,   // credits/hr
};

const LEVEL_MULT = [1.0, 1.0, 1.8, 3.0]; // index = level (1..3 for resource buildings)

export function calculateAfkRate(territoryId, slotIdx) {
  const meta = loadMeta();
  const t = meta.domains.Red.territories[territoryId];
  const tDef = TERRITORIES[territoryId];
  if (!t || !tDef) return { ore: 0, credits: 0 };
  const b = t.buildings[slotIdx];
  if (!b || b.type === 'fort') return { ore: 0, credits: 0 };

  const baseRate = BASE_RATE[b.type] ?? 0;
  const levelMult = LEVEL_MULT[b.level] ?? 1.0;
  const domMult = Math.min(1.5, Math.max(1.0, 1.0 + (t.domination - 50) / 100));
  const bias = b.type === 'mine' ? tDef.resourceBias.ore : tDef.resourceBias.credits;
  const accessoryMult = 1.0; // future

  const ratePerHour = baseRate * levelMult * domMult * bias * accessoryMult;
  return b.type === 'mine'
    ? { ore: ratePerHour, credits: 0 }
    : { ore: 0, credits: ratePerHour };
}

export function calculateAfkPending(territoryId) {
  const meta = loadMeta();
  const t = meta.domains.Red.territories[territoryId];
  if (!t) return { ore: 0, credits: 0 };
  const elapsedMs = Date.now() - t.afk.lastCollectedAt;
  const elapsedHrs = Math.min(AFK_CAP_HOURS, elapsedMs / HOUR_MS);

  let ore = 0, credits = 0;
  for (let i = 0; i < 3; i++) {
    const r = calculateAfkRate(territoryId, i);
    ore += r.ore * elapsedHrs;
    credits += r.credits * elapsedHrs;
  }
  return { ore: Math.floor(ore), credits: Math.floor(credits) };
}

export function collectAfk(territoryId) {
  const meta = loadMeta();
  const t = meta.domains.Red.territories[territoryId];
  if (!t) return { ore: 0, credits: 0 };
  const pending = calculateAfkPending(territoryId);
  meta.resources.ore += pending.ore;
  meta.resources.credits += pending.credits;
  t.afk.lastCollectedAt = Date.now();
  saveMeta();
  return pending;
}

export function collectAfkAll() {
  const meta = loadMeta();
  const territories = Object.keys(meta.domains.Red.territories);
  let totalOre = 0, totalCredits = 0;
  for (const id of territories) {
    const p = collectAfk(id);
    totalOre += p.ore;
    totalCredits += p.credits;
  }
  return { ore: totalOre, credits: totalCredits };
}

// ─────────────────────────────────────────────────────────────
// Meta state — persistence layer
// Single localStorage object: cybervamp.meta.v1
// Versioned for forward migrations.
// See design doc 02-metastate-schema.md for schema reference.
// ─────────────────────────────────────────────────────────────

const STORAGE_KEY = 'cybervamp.meta.v1';
const CURRENT_VERSION = 1;

function makeDefault() {
  const now = Date.now();
  return {
    version: CURRENT_VERSION,
    createdAt: now,
    lastSeenAt: now,

    player: {
      nexusName: 'The Nexus',
      primaryFaction: 'Red',
      onboardingComplete: false,
      tutorialStep: 0,
    },

    resources: {
      ore: 0,
      credits: 0,
      blood: 0,
      shards: 0,
    },

    domains: {
      Red: {
        unlocked: true,
        territories: {
          neon_bazaar:     makeTerritoryDefault(),
          spire_districts: makeTerritoryDefault(),
          foundry:         makeTerritoryDefault(),
          static_junkyard: makeTerritoryDefault(),
          pulse_cathedral: makeTerritoryDefault(),
          aether_nexus:    Object.assign(makeTerritoryDefault(), { unlocked: false }),
        },
      },
    },

    stats: {
      battlesWon: 0,
      battlesLost: 0,
      totalDamageDealt: 0,
      fastestWinTurns: null,
      bossesDefeated: [],
    },
  };
}

function makeTerritoryDefault() {
  return {
    domination: 0,
    state: 'stable',
    bossDefeated: false,
    buildings: [null, null, null],
    afk: {
      lastCollectedAt: Date.now(),
      pendingOre: 0,
      pendingCredits: 0,
    },
    battlesPlayed: 0,
    lastBattleAt: null,
    unlocked: true,
  };
}

let _cache = null;
let _saveTimer = null;
const SAVE_THROTTLE_MS = 500;

export function loadMeta() {
  if (_cache) return _cache;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      _cache = makeDefault();
      saveMetaImmediate();
      return _cache;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid meta payload');
    _cache = migrate(parsed);
    _cache.lastSeenAt = Date.now();
    return _cache;
  } catch (err) {
    console.warn('[meta] Load failed, using defaults:', err);
    _cache = makeDefault();
    return _cache;
  }
}

export function saveMeta() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveMetaImmediate, SAVE_THROTTLE_MS);
}

export function saveMetaImmediate() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  if (!_cache) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache));
  } catch (err) {
    console.error('[meta] Save failed:', err);
  }
}

export function resetMeta() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  localStorage.removeItem(STORAGE_KEY);
  _cache = makeDefault();
  saveMetaImmediate();
  return _cache;
}

// ── Migration ──────────────────────────────────────────────────
function migrate(meta) {
  // Future versions: walk meta.version up to CURRENT_VERSION, applying
  // each migration step. For now, v1 is the only schema.
  if (!meta.version) meta.version = CURRENT_VERSION;
  // Defensive defaults: if any expected field is missing, fill from default.
  const def = makeDefault();
  if (!meta.player) meta.player = def.player;
  if (!meta.resources) meta.resources = def.resources;
  if (!meta.domains) meta.domains = def.domains;
  if (!meta.domains.Red) meta.domains.Red = def.domains.Red;
  if (!meta.stats) meta.stats = def.stats;
  return meta;
}

// ── Resource API ───────────────────────────────────────────────
export function addResource(type, amount) {
  const meta = loadMeta();
  meta.resources[type] = (meta.resources[type] || 0) + amount;
  saveMeta();
}

export function spendResource(type, amount) {
  const meta = loadMeta();
  if ((meta.resources[type] || 0) < amount) return false;
  meta.resources[type] -= amount;
  saveMeta();
  return true;
}

export function hasResource(type, amount) {
  const meta = loadMeta();
  return (meta.resources[type] || 0) >= amount;
}

// ── Save on tab close ─────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', saveMetaImmediate);
}

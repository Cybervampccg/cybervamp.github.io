# Cybervamp CCG — v2 Project

This is the rebuilt Vite-based version of Cybervamp CCG. It will live in parallel with the original `mobile/` build until v2 is ready to take over.

- **Branch:** `cybervamp-v2`
- **Deployed at:** https://cybervampccg.github.io/v2/ (after first push triggers the workflow)
- **Original game stays at:** https://cybervampccg.github.io/

---

## First-time setup (Windows)

You should already have Node.js v24 and Git 2.52 installed.

```powershell
# 1. cd to your existing repo
cd C:\Projects\cybervamp.github.io

# 2. Create the new branch
git checkout -b cybervamp-v2

# 3. Unzip the scaffold zip into the repo root.
# After unzipping you should see: index.html, package.json, src/, public/,
# .github/, scripts/, README-V2.md (this file), and existing files like
# mobile/, README.md, etc. left untouched.

# 4. Install Vite + dependencies
npm install
# (~30s, downloads ~10MB to node_modules/)

# 5. Run the dev server
npm run dev
# Browser opens to http://localhost:5173
# You should see "CYBERVAMP v2.0 · scaffold ready" with card count + meta info.
```

If localhost shows the boot screen with `196 cards loaded` and `Meta state: v1`, the toolchain is working. ✅

---

## Daily workflow

```powershell
# Pull latest
git pull

# Edit code in your editor
# (VS Code recommended — it auto-reloads on save thanks to Vite)

# Run dev server (live reload)
npm run dev

# Test changes
# When ready to deploy:
git add .
git commit -m "describe what changed"
git push origin cybervamp-v2
```

The push triggers the GitHub Action which:
1. Builds the project (`npm run build`)
2. Copies `dist/` contents into `v2/` subfolder on the `main` branch
3. GitHub Pages auto-deploys it to `cybervampccg.github.io/v2/`

You should see the new version live within ~2 minutes of pushing.

---

## Deploying for the first time

After step 5 above, do the initial commit/push:

```powershell
git add .
git commit -m "scaffold: initialize Vite v2 project"
git push origin cybervamp-v2
```

Then go to GitHub:

1. Open your repo at `github.com/Cybervampccg/cybervamp.github.io`
2. Click **Settings → Pages**
3. Confirm "Source" is set to `Deploy from a branch`, branch `main`, folder `/ (root)`
4. Wait ~2 min, then visit `https://cybervampccg.github.io/v2/`

Should show the same boot screen as localhost.

---

## Project structure

```
.
├── index.html              ← Vite entry, tiny bootstrap
├── package.json            ← deps + scripts
├── vite.config.js          ← /v2/ base path config
├── .gitignore              ← excludes node_modules, dist
│
├── src/
│   ├── main.js             ← boot, will become menu/home routing
│   ├── styles/
│   │   └── main.css        ← design tokens + boot screen styles
│   │
│   ├── game/               ← battle engine modules
│   │   ├── cards.js        ← all 196 cards (auto-generated from CSV)
│   │   ├── state.js        ← G state object, makeInst, getEffectivePower
│   │   ├── keywords.js     ← parseKeywords, hasKeyword
│   │   ├── combat.js       ← attack/block/support/resolve
│   │   ├── abilities.js    ← {Exhaust}/{Overexhaust} pay-abilities
│   │   ├── spells.js       ← spell resolution chain
│   │   ├── tokens.js       ← orbiting + creature tokens
│   │   ├── ai.js           ← AI turn logic
│   │   ├── ui.js           ← hand fan, slots, drag/tap handling
│   │   ├── audio.js        ← SFX, BGM, haptic
│   │   ├── hero-moment.js  ← cinematic spell/ability animation
│   │   └── missions.js     ← mission objectives + tracking
│   │
│   ├── meta/               ← persistence + meta-game systems
│   │   ├── meta-state.js   ← localStorage save/load (DONE)
│   │   ├── territory.js    ← Cyber City 6 territories (DONE)
│   │   ├── buildings.js    ← Mine/Bank/Fort tables (DONE)
│   │   └── afk.js          ← AFK resource math (DONE)
│   │
│   └── screens/            ← top-level routes
│       ├── home-screen.js
│       ├── map-screen.js
│       └── battle-screen.js
│
├── public/                 ← static assets, copied verbatim to dist/
│   ├── images/             ← (you upload card art here)
│   └── audio/              ← (you upload SFX/music here)
│
├── scripts/
│   └── translate-csv.js    ← CSV → cards.js pipeline
│
└── .github/workflows/
    └── deploy.yml          ← auto-deploy on push to cybervamp-v2
```

---

## What's done in this scaffold

✅ Working dev server (boot screen confirms ~196 cards load)
✅ All 196 cards translated from CSV with new cost format
✅ Meta state with localStorage save/load (versioned for migrations)
✅ AFK math (calculateAfkRate, calculateAfkPending, collectAfk)
✅ Cyber City territory data (6 territories with modifiers, decks, biases)
✅ Building cost tables
✅ Design token CSS (matches the polished v1 build)
✅ GitHub Action auto-deploy to `/v2/`
✅ All other modules stubbed with TODOs

## What's NOT done yet

❌ Game engine (state machine, combat, abilities, spells)
❌ UI shell (hand fan, slots, vitals, mission overlay)
❌ AI opponent
❌ Map screen + battle handoff
❌ Tutorial flow
❌ Card art uploaded to /public/images/

These are the next work sessions. We'll tackle each module one-by-one with focused testing before moving on.

---

## Card data refresh

If you update `cards.csv` (rename, rebalance, add new card):

```powershell
# Place the updated CSV at scripts/cards.csv (or update the path in translate-csv.js)
node scripts/translate-csv.js
```

This regenerates `src/game/cards.js`. Commit both files together.

---

## Flagged cards from initial translation

12 cards flagged (see `cards-flagged.json` in the project root):
- 6 Sire Lords / unique cards: missing image URLs
- 6 token templates: no cost (expected — tokens are spawned, not paid for)

All other cards translated cleanly. No rebalancing needed at this stage.

---

## Help / Troubleshooting

**`npm install` fails on Windows:**
- Make sure your Node version is v18+ (`node --version`)
- Try clearing the npm cache: `npm cache clean --force`

**Port 5173 already in use:**
- Edit `vite.config.js` and change the port to e.g. 5174

**GitHub Action fails:**
- Check the **Actions** tab on GitHub for the error log
- Most common: branch protection or token permissions on the repo

**Boot screen never appears:**
- Open DevTools (F12), check the Console for errors
- Look for module load errors in the Network tab

---

## Next session

When you're ready to continue, tell me:
1. Did `npm install` + `npm run dev` work? (screenshot of boot screen if helpful)
2. Did the GitHub Action deploy successfully?
3. Tell me to "begin engine" and I'll write the first set of game modules.

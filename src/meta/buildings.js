// Buildings — Mine / Bank / Fort / Citadel
// Cost & effect tables per design doc 03-afk-math.md

export const BUILDING_COSTS = {
  mine:     [null, { ore: 200 }, { ore: 800 }, { ore: 2400, credits: 600 }],
  bank:     [null, { ore: 250, credits: 100 }, { ore: 750, credits: 400 }, { ore: 2200, credits: 1200 }],
  fort:     [null, { ore: 350 }, { ore: 1100 }, { ore: 3500, credits: 1500 }, { ore: 8000, credits: 5000 }],
};

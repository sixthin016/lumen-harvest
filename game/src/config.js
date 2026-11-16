// Lumen Harvest — tuning constants. One place for every number the game
// balances on, so a play-test can retune the feel without touching logic.
export const STEP = 1 / 60;

export const FIELD = {
  width: 1280,
  height: 720,
};

// The player ship.
export const PLAYER = {
  radius: 16,
  accel: 2600,
  maxSpeed: 340,
  drag: 3.2,
  fireInterval: 0.16,
  bulletSpeed: 640,
  bulletCost: 1,
  startEnergy: 40,
  maxEnergy: 100,
  startHull: 3,
  maxHull: 5,
  invulnerableSeconds: 1.6,
  magnetRadius: 90,
};

// Lumen shards: the light you harvest. They are score, ammo and life.
export const LUMEN = {
  radius: 7,
  value: 1,
  score: 10,
  magnetSpeed: 420,
  driftSpeed: 26,
  lifeSeconds: 14,
  surgeEvery: 30,
};

// Enemy kinds. Each one drifts, hunts or charges in its own way.
export const MOTES = {
  drifter: { radius: 15, hp: 1, speed: 55, score: 50, lumens: 2, color: '#ff5d8f' },
  weaver: { radius: 13, hp: 1, speed: 95, score: 80, lumens: 2, color: '#c77dff' },
  bruiser: { radius: 26, hp: 4, speed: 38, score: 150, lumens: 5, color: '#ff9f1c' },
  splitter: { radius: 18, hp: 2, speed: 70, score: 120, lumens: 3, color: '#4cc9f0' },
  boss: { radius: 64, hp: 60, speed: 26, score: 2000, lumens: 25, color: '#ff2e63' },
};

// A wave spawns its budget of motes over its duration, then rests.
export const WAVES = {
  baseBudget: 10,
  budgetPerWave: 4,
  spawnInterval: 0.9,
  spawnIntervalMin: 0.32,
  restSeconds: 4,
  bossEvery: 5,
  hpPerWave: 0.12,
  speedPerWave: 0.045,
};

// Surge upgrades offered between banks of lumens. Pick one, keep it.
export const SURGES = [
  { id: 'split', name: 'Split Lance', desc: '+1 bolt per shot', max: 3 },
  { id: 'rapid', name: 'Rapid Cycler', desc: 'Fire 25% faster', max: 3 },
  { id: 'magnet', name: 'Magnet Coil', desc: '+60 harvest radius', max: 3 },
  { id: 'aegis', name: 'Aegis Shield', desc: 'Block the next hit', max: 2 },
  { id: 'nova', name: 'Nova Burst', desc: 'Blast clears the field', max: 2 },
  { id: 'hull', name: 'Hull Plating', desc: '+1 hull, repair 1', max: 2 },
  { id: 'greed', name: 'Greed Lens', desc: 'Motes drop +1 lumen', max: 2 },
  { id: 'surge', name: 'Overcharge', desc: 'Bullets pierce +1 mote', max: 2 },
];

export const COMBO = {
  windowSeconds: 4,
  maxMultiplier: 8,
};

export const NOVA = {
  cost: 15,
  radius: 320,
  damage: 3,
  cooldownSeconds: 1.2,
};

export const BEST_KEY = 'lumen-harvest-best';

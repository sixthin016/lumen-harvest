# lumen-harvest

[![make.fun · best-game-01](https://make.fun/badge/best-game-01.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![rank](https://make.fun/badge/best-game-01/sixthin016/lumen-harvest/rank.svg)](https://make.fun/bounty/best-game-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)
[![reward](https://make.fun/badge/best-game-01/sixthin016/lumen-harvest/reward.svg)](https://make.fun/bounty/best-game-01?utm_source=github&utm_medium=readme&utm_campaign=best-game-01)

**Lumen Harvest** — a neon arena survival game. You fly the last light-ship, the *Kestrel*, through a collapsing starfield. Void motes drift in; your light-lance destroys them, and they burst into golden lumens. The twist: **light is everything**. Every bolt you fire spends a lumen of energy, and every lumen you harvest reloads it — so you must spend light to make light. Chain kills without taking a hit to raise your combo multiplier, bank 30 lumens for a SURGE upgrade (pick 1 of 3), and survive escalating waves until the Hollow Star boss arrives every 5th wave. Three hull hearts, no network, no mercy — just you, the drift, and the dark.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — WASD / arrows to fly, mouse to aim, hold click or Space to fire, Shift or right-click for a Nova burst, P to pause, M to mute, R to restart.

## How it is built

Plain static files under `game/` — one HTML page, ES modules, canvas 2D, procedural WebAudio sound, zero assets, zero network requests. The source is split by job: `config.js` (tuning), `random.js` (seeded RNG), `audio.js` (synthesized sound), `input.js` (keyboard + mouse), `particles.js` (sparks, rings, floating text), `world.js` (ship, motes, waves, boss, upgrades, scoring), `render.js` (starfield, entities, HUD, screens), `shots.js` (deterministic screenshot staging), `main.js` (boot and the game loop). `main.ts` hands the game in by copying `game/` and `screenshots/` to `/output` and writing `dossier.json`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wffmhs5a&utm_source=github&utm_medium=readme&utm_campaign=best-game-01) · AI agents build software for cash rewards</sub>

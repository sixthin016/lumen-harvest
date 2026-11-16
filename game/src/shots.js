// The screenshot scenes behind ?shot=start|play|surge|end. Each one plays
// the real rules forward from a fresh world for a fixed number of steps,
// steered by a simple autopilot, so the frame is what a real game looks
// like and the same seed always gives the same frame.
import { FIELD, PLAYER, STEP } from './config.js';
import { EVENT_OVER, EVENT_SURGE } from './world.js';
import { SCREEN_OVER, SCREEN_PLAY, SCREEN_SURGE, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 24;
const SURGE_LIMIT_SECONDS = 150;
const END_LIMIT_SECONDS = 600;
const HORIZON_PLAY = 1.2;
const HORIZON_END = 0.22;
const SAMPLE = 1 / 30;
const DIRECTIONS = [0, -1, 1];
const MARGIN = 12;

/** Seconds until moving in `direction` runs the ship into a mote; Infinity when it never does. */
function timeToHit(state, direction, horizon) {
  const p = state.player;
  for (let t = SAMPLE; t <= horizon; t += SAMPLE) {
    const x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, p.x + direction * PLAYER.maxSpeed * t));
    for (let index = 0; index < state.motes.length; index += 1) {
      const mote = state.motes[index];
      const y = mote.y + mote.vy * t;
      const mx = mote.x + mote.vx * t;
      const rr = mote.radius + PLAYER.radius;
      if (Math.abs(y - p.y) < rr && Math.abs(mx - x) < rr + MARGIN) return t;
    }
  }
  return Infinity;
}

/** Steer toward the nearest lumen when that is safe, else toward open sky. */
function autopilot(state, horizon) {
  const p = state.player;
  let lumen = null;
  let bestD = Infinity;
  for (let index = 0; index < state.lumens.length; index += 1) {
    const l = state.lumens[index];
    const d = Math.abs(l.x - p.x) + Math.abs(l.y - p.y);
    if (d < bestD) {
      bestD = d;
      lumen = l;
    }
  }
  const target = lumen === null ? FIELD.width / 2 : lumen.x;
  const centre = p.x;
  const wanted = target > centre + 10 ? 1 : target < centre - 10 ? -1 : 0;
  let best = wanted;
  let bestTime = timeToHit(state, wanted, horizon);
  for (let index = 0; index < DIRECTIONS.length && bestTime !== Infinity; index += 1) {
    const time = timeToHit(state, DIRECTIONS[index], horizon);
    if (time > bestTime) {
      bestTime = time;
      best = DIRECTIONS[index];
    }
  }
  return best;
}

/** Where the autopilot aims: the nearest mote, leading its motion by the
 * bullet's flight time, so the bolt meets it instead of chasing its wake. */
function aimAt(state) {
  const p = state.player;
  let mote = null;
  let bestD = Infinity;
  for (let index = 0; index < state.motes.length; index += 1) {
    const m = state.motes[index];
    const d = (m.x - p.x) * (m.x - p.x) + (m.y - p.y) * (m.y - p.y);
    if (d < bestD) {
      bestD = d;
      mote = m;
    }
  }
  if (!mote) return { x: p.x, y: p.y - 200 };
  const flight = Math.sqrt(bestD) / PLAYER.bulletSpeed;
  return { x: mote.x + mote.vx * flight, y: mote.y + mote.vy * flight };
}

/** The nearest mote and its distance, for the fire decision. */
function nearestMote(state) {
  const p = state.player;
  let mote = null;
  let bestD = Infinity;
  for (let index = 0; index < state.motes.length; index += 1) {
    const m = state.motes[index];
    const d = (m.x - p.x) * (m.x - p.x) + (m.y - p.y) * (m.y - p.y);
    if (d < bestD) {
      bestD = d;
      mote = m;
    }
  }
  return mote === null ? null : { mote, dist: Math.sqrt(bestD) };
}

// Fire discipline: a bolt costs a lumen, so a skilled pilot only shoots
// when the bolt is likely to land. Hold fire at long range (the mote has
// time to dodge) and keep a small energy reserve, so the ship never
// spends itself dry and starves. A mote at point-blank range is always
// worth a shot while any light is left.
const FIRE_RANGE = 460;
const FIRE_RESERVE = 8;
const POINT_BLANK = 160;

function shouldFire(state) {
  const p = state.player;
  if (p.energy < PLAYER.bulletCost) return false;
  const near = nearestMote(state);
  if (near === null) return false;
  if (near.dist <= POINT_BLANK) return true;
  return near.dist <= FIRE_RANGE && p.energy >= FIRE_RESERVE;
}

/** Run the world forward with the autopilot flying and firing. `smart`
 * flies like a skilled pilot (lead aim, fire discipline); a reckless
 * pilot (the end scene) fires at everything and pays for it. */
function playForward(world, seconds, horizon, stopOn, smart) {
  const steps = Math.floor(seconds / STEP);
  for (let index = 0; index < steps; index += 1) {
    const dir = autopilot(world.state, horizon);
    const aim = smart ? aimAt(world.state) : aimAtReckless(world.state);
    const firing = smart ? shouldFire(world.state) : true;
    const events = world.step(STEP, { mx: dir, my: 0, firing, aimX: aim.x, aimY: aim.y }, false);
    if (stopOn && (events & stopOn)) return events;
    if (events & EVENT_OVER) return events;
  }
  return 0;
}

/** The reckless pilot's aim: straight at the nearest mote, no lead. */
function aimAtReckless(state) {
  const p = state.player;
  let mote = null;
  let bestD = Infinity;
  for (let index = 0; index < state.motes.length; index += 1) {
    const m = state.motes[index];
    const d = (m.x - p.x) * (m.x - p.x) + (m.y - p.y) * (m.y - p.y);
    if (d < bestD) {
      bestD = d;
      mote = m;
    }
  }
  if (!mote) return { x: p.x, y: p.y - 200 };
  return { x: mote.x, y: mote.y };
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title over a drifting field. play: mid-wave action with a
 * live HUD. surge: the upgrade choice, mid-game. end: the game-over
 * screen after a hurried pilot is caught out.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'surge' && name !== 'end') {
    for (let index = 0; index < START_SECONDS / STEP; index += 1) {
      world.step(STEP, { mx: 0, my: 0, firing: false, aimX: 640, aimY: 200 }, true);
    }
    return { screen: SCREEN_TITLE };
  }
  if (name === 'surge') {
    playForward(world, SURGE_LIMIT_SECONDS, HORIZON_PLAY, EVENT_SURGE, true);
    return { screen: world.state.surgePending ? SCREEN_SURGE : SCREEN_PLAY };
  }
  const limit = name === 'end' ? END_LIMIT_SECONDS : PLAY_SECONDS;
  const horizon = name === 'end' ? HORIZON_END : HORIZON_PLAY;
  playForward(world, limit, horizon, 0, name !== 'end');
  const over = world.state.over;
  return { screen: over ? SCREEN_OVER : SCREEN_PLAY };
}

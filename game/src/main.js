// Boot and the one loop: input is read every frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. The game
// moves between five screens: title, play, surge, paused and game over.
//
// ?seed=N fixes the falling pattern. ?shot=start|play|surge|end (with
// &seed=N) stages that scene instead of running the loop, paints it twice
// and sets window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, LUMEN, STEP } from './config.js';
import { createRandom } from './random.js';
import { createAudio } from './audio.js';
import { createParticles } from './particles.js';
import { createWorld, EVENT_HIT, EVENT_OVER, EVENT_SURGE, EVENT_WAVE_CLEAR } from './world.js';
import {
  ACTION_CONFIRM, ACTION_MUTE, ACTION_NOVA, ACTION_PAUSE, ACTION_RESTART, createInput,
} from './input.js';
import {
  SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_SURGE, SCREEN_TITLE, createRenderer,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();
const particles = createParticles();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

// The world hands the renderer its flashes of feedback each step.
function drainFx() {
  for (const fx of world.fx) {
    if (fx.kind === 'burst') particles.burst(fx.x, fx.y, fx.color, fx.count, fx.speed, fx.life);
    else if (fx.kind === 'ring') particles.ring(fx.x, fx.y, fx.color, fx.maxRadius);
    else if (fx.kind === 'text') particles.text(fx.x, fx.y, fx.value, fx.color, fx.big);
  }
  world.fx = [];
}

function drainSfx() {
  const sfx = world.sfx;
  if (sfx.shot > 0) audio.shoot();
  if (sfx.pickup > 0) audio.pickup(world.state.streak);
  if (sfx.hit > 0) audio.hit();
  if (sfx.hurt > 0) audio.hurt();
  if (sfx.surge > 0) audio.surge();
  if (sfx.nova > 0) audio.nova();
  if (sfx.waveClear > 0) audio.waveClear();
  if (sfx.boss > 0) audio.boss();
  if (sfx.over > 0) audio.over();
  world.sfx = { shot: 0, pickup: 0, hit: 0, hurt: 0, surge: 0, nova: 0, waveClear: 0, boss: 0, over: 0 };
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    drainFx();
    const ui = {
      best: world.state.score,
      multiplier: world.multiplier,
      muted: false,
      surgeChoices: world.state.surgePending,
      hoverIndex: -1,
    };
    renderer.draw(world.state, scene.screen, ui, particles);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  const audioUnlocked = { done: false };
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let surgeHover = -1;
  let lastWave = 1;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function unlockAudio() {
    if (!audioUnlocked.done) {
      audio.unlock();
      audioUnlocked.done = true;
    }
  }

  function startGame() {
    unlockAudio();
    world.reset();
    lastWave = 1;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. ${world.state.player.hull} hull. Harvest lumens, spend light to fire.`);
  }

  function endGame() {
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}. Press R to fly again.`);
  }

  function setBanner(text) {
    world.state.banner = { text, at: world.state.time };
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { mx: 0, my: 0, firing: false, aimX: 640, aimY: 200 }, true);
      drainFx();
      return;
    }
    const dir = input.direction();
    const aim = { x: input.mouse.x || 640, y: input.mouse.y || 200 };
    const events = world.step(
      STEP,
      { mx: dir.x, my: dir.y, firing: input.firing, aimX: aim.x, aimY: aim.y },
      false,
    );
    drainFx();
    drainSfx();
    if (world.state.wave !== lastWave) {
      lastWave = world.state.wave;
      setBanner(`WAVE ${world.state.wave}`);
    }
    if (events & EVENT_SURGE) {
      screen = SCREEN_SURGE;
      announce('Surge! Choose one upgrade.');
    } else if (events & EVENT_OVER) {
      endGame();
    } else if (events & EVENT_HIT) {
      announce(world.state.player.hull === 1 ? 'Hit. 1 hull left.' : `Hit. ${world.state.player.hull} hull left.`);
    } else if (events & EVENT_WAVE_CLEAR) {
      setBanner(`WAVE ${world.state.wave} CLEAR`);
    }
  }

  function surgeCardAt(x, y) {
    const choices = world.state.surgePending;
    if (!choices) return -1;
    const cardW = 300;
    const cardH = 210;
    const gap = 28;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    const startX = FIELD.width / 2 - totalW / 2;
    const top = 250;
    for (let i = 0; i < choices.length; i += 1) {
      const cx = startX + i * (cardW + gap);
      if (x >= cx && x <= cx + cardW && y >= top && y <= top + cardH) return i;
    }
    return -1;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_RESTART && (screen === SCREEN_OVER || screen === SCREEN_PLAY)) {
      startGame();
      return;
    }
    if (screen === SCREEN_SURGE) {
      // Keys 1-3 pick a card; a click on a card picks it too.
      if (actions & ACTION_CONFIRM) {
        const index = surgeCardAt(input.mouse.x, input.mouse.y);
        if (index >= 0) {
          const choice = world.state.surgePending[index];
          world.applySurge(choice.id);
          drainSfx();
          screen = SCREEN_PLAY;
          announce(`Surge: ${choice.name}.`);
        }
      }
      return;
    }
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) {
      startGame();
      return;
    }
    if (actions & ACTION_NOVA && screen === SCREEN_PLAY) {
      if (world.triggerNova()) {
        drainFx();
        drainSfx();
      }
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_SURGE) {
      surgeHover = surgeCardAt(input.mouse.x, input.mouse.y);
      particles.step(STEP);
    } else if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
      particles.step(STEP);
    } else {
      accumulator = 0;
      particles.step(STEP);
    }
    const ui = {
      best,
      multiplier: world.multiplier,
      muted: audio.muted,
      surgeChoices: world.state.surgePending,
      hoverIndex: surgeHover,
    };
    renderer.draw(world.state, screen, ui, particles);
  }

  // Number keys pick a surge card.
  window.addEventListener('keydown', (event) => {
    if (screen !== SCREEN_SURGE || !world.state.surgePending) return;
    const index = ['Digit1', 'Digit2', 'Digit3'].indexOf(event.code);
    if (index >= 0 && index < world.state.surgePending.length) {
      const choice = world.state.surgePending[index];
      world.applySurge(choice.id);
      drainSfx();
      screen = SCREEN_PLAY;
      announce(`Surge: ${choice.name}.`);
    }
  });

  // Leaving the tab pauses a running game rather than letting motes drift in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // A tiny hook for automated play-tests: read-only state, no cheats.
  window.__lumen = {
    state() {
      const s = world.state;
      return {
        screen,
        score: s.score,
        wave: s.wave,
        hull: s.player.hull,
        energy: s.player.energy,
        motes: s.motes.length,
        lumens: s.lumens.length,
        kills: s.kills,
        surge: !!s.surgePending,
        over: s.over,
      };
    },
  };

  announce('Lumen Harvest. Press Space or click to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

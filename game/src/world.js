// The world: the ship, the motes, the lumens, the waves and the boss.
// One fixed step advances everything; the renderer only paints the state.
import {
  COMBO, FIELD, LUMEN, MOTES, NOVA, PLAYER, SURGES, WAVES,
} from './config.js';

export const EVENT_NONE = 0;
export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_SURGE = 4;
export const EVENT_WAVE_CLEAR = 8;
export const EVENT_BOSS = 16;

const MINI = { radius: 9, hp: 1, speed: 85, score: 25, lumens: 1, color: '#4cc9f0' };

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const world = {
    random,
    state: null,
    sfx: { shot: 0, pickup: 0, hit: 0, hurt: 0, surge: 0, nova: 0, waveClear: 0, boss: 0, over: 0 },
    fx: [],

    reset() {
      this.sfx = { shot: 0, pickup: 0, hit: 0, hurt: 0, surge: 0, nova: 0, waveClear: 0, boss: 0, over: 0 };
      this.fx = [];
      this.state = {
        time: 0,
        player: {
          x: FIELD.width / 2,
          y: FIELD.height * 0.62,
          vx: 0,
          vy: 0,
          aim: -Math.PI / 2,
          hull: PLAYER.startHull,
          energy: PLAYER.startEnergy,
          fireTimer: 0,
          invuln: 0,
          shield: 0,
          novaCooldown: 0,
        },
        upgrades: { split: 0, rapid: 0, magnet: 0, aegis: 0, nova: 0, hull: 0, greed: 0, pierce: 0 },
        bullets: [],
        motes: [],
        lumens: [],
        wave: 1,
        waveState: 'spawning',
        spawnTimer: 0.6,
        spawned: 0,
        budget: WAVES.baseBudget,
        restTimer: 0,
        boss: null,
        bossSpawnTimer: 3,
        score: 0,
        banked: 0,
        streak: 0,
        comboTimer: 0,
        surgePending: null,
        kills: 0,
        shotsFired: 0,
        shotsHit: 0,
        shake: 0,
        banner: null,
        over: false,
      };
    },

    get multiplier() {
      const s = this.state;
      return Math.min(1 + Math.floor(s.streak / 5), COMBO.maxMultiplier);
    },

    magnetRadius() {
      return PLAYER.magnetRadius + this.state.upgrades.magnet * 60;
    },

    fireInterval() {
      return PLAYER.fireInterval * Math.pow(0.8, this.state.upgrades.rapid);
    },

    spawnMote(kind, x, y) {
      const s = this.state;
      const def = kind === 'mini' ? MINI : MOTES[kind];
      const hpScale = 1 + WAVES.hpPerWave * (s.wave - 1);
      const spScale = 1 + WAVES.speedPerWave * (s.wave - 1);
      const mote = {
        kind,
        x,
        y,
        vx: 0,
        vy: 0,
        hp: Math.max(1, Math.round(def.hp * hpScale)),
        maxHp: Math.max(1, Math.round(def.hp * hpScale)),
        radius: def.radius,
        speed: def.speed * spScale,
        score: def.score,
        lumens: def.lumens + (kind !== 'mini' ? this.state.upgrades.greed : 0),
        color: def.color,
        t: random.range(0, Math.PI * 2),
        seed: random.range(0, Math.PI * 2),
      };
      if (kind === 'boss') {
        mote.hp = Math.round(def.hp * (1 + 0.25 * (s.wave - 1)));
        mote.maxHp = mote.hp;
        s.boss = mote;
      }
      s.motes.push(mote);
      return mote;
    },

    pickKind() {
      const s = this.state;
      const roll = random.next();
      if (s.wave >= 4 && roll < 0.14) return 'splitter';
      if (s.wave >= 3 && roll < 0.34) return 'bruiser';
      if (s.wave >= 2 && roll < 0.58) return 'weaver';
      return 'drifter';
    },

    spawnOne() {
      const s = this.state;
      const isBossWave = s.wave % WAVES.bossEvery === 0;
      if (isBossWave && !s.boss && s.spawned === 0) {
        this.spawnMote('boss', FIELD.width / 2, -80);
        s.spawned += 1;
        this.sfx.boss += 1;
        return EVENT_BOSS;
      }
      const kind = this.pickKind();
      const edge = random.next();
      let x;
      let y;
      if (edge < 0.7) {
        x = random.range(30, FIELD.width - 30);
        y = -30;
      } else if (edge < 0.85) {
        x = -30;
        y = random.range(40, FIELD.height * 0.5);
      } else {
        x = FIELD.width + 30;
        y = random.range(40, FIELD.height * 0.5);
      }
      this.spawnMote(kind, x, y);
      s.spawned += 1;
      return EVENT_NONE;
    },

    startWave() {
      const s = this.state;
      s.budget = WAVES.baseBudget + WAVES.budgetPerWave * (s.wave - 1);
      s.spawned = 0;
      s.spawnTimer = 0.5;
      s.waveState = 'spawning';
      s.bossSpawnTimer = 3;
      s.banner = { text: `WAVE ${s.wave}`, at: s.time };
    },

    clearWave() {
      const s = this.state;
      const bonus = s.wave * 100 * this.multiplier;
      s.score += bonus;
      s.waveState = 'rest';
      s.restTimer = WAVES.restSeconds;
      s.banner = { text: `WAVE ${s.wave} CLEAR`, at: s.time };
      this.sfx.waveClear += 1;
      this.fx.push({ kind: 'text', x: FIELD.width / 2, y: FIELD.height * 0.4, value: `WAVE ${s.wave} CLEAR  +${bonus}`, color: '#ffd166', big: true });
      return EVENT_WAVE_CLEAR;
    },

    fireBullets(aimX, aimY) {
      const s = this.state;
      const p = s.player;
      const count = 1 + s.upgrades.split;
      const baseAngle = Math.atan2(aimY - p.y, aimX - p.x);
      p.aim = baseAngle;
      for (let i = 0; i < count; i += 1) {
        const offset = (i - (count - 1) / 2) * 0.14;
        const angle = baseAngle + offset;
        s.bullets.push({
          x: p.x + Math.cos(angle) * (PLAYER.radius + 6),
          y: p.y + Math.sin(angle) * (PLAYER.radius + 6),
          vx: Math.cos(angle) * PLAYER.bulletSpeed,
          vy: Math.sin(angle) * PLAYER.bulletSpeed,
          pierce: s.upgrades.pierce,
          life: 1.1,
        });
      }
      s.shotsFired += count;
      this.sfx.shot += 1;
    },

    triggerNova() {
      const s = this.state;
      const p = s.player;
      if (p.novaCooldown > 0 || p.energy < NOVA.cost || s.over) return false;
      p.energy -= NOVA.cost;
      p.novaCooldown = NOVA.cooldownSeconds;
      const damage = NOVA.damage + s.upgrades.nova;
      const radius = NOVA.radius + s.upgrades.nova * 60;
      this.sfx.nova += 1;
      this.fx.push({ kind: 'ring', x: p.x, y: p.y, color: '#ffd166', maxRadius: radius });
      this.fx.push({ kind: 'burst', x: p.x, y: p.y, color: '#ffd166', count: 40, speed: 420, life: 0.6 });
      for (const mote of s.motes) {
        if (dist2(mote.x, mote.y, p.x, p.y) < (radius + mote.radius) * (radius + mote.radius)) {
          this.damageMote(mote, damage);
        }
      }
      return true;
    },

    damageMote(mote, amount) {
      const s = this.state;
      mote.hp -= amount;
      s.shotsHit += 1;
      this.fx.push({ kind: 'burst', x: mote.x, y: mote.y, color: mote.color, count: 6, speed: 180, life: 0.4 });
      if (mote.hp <= 0) this.killMote(mote);
    },

    killMote(mote) {
      const s = this.state;
      const index = s.motes.indexOf(mote);
      if (index >= 0) s.motes.splice(index, 1);
      s.kills += 1;
      s.streak += 1;
      s.comboTimer = COMBO.windowSeconds;
      const gained = mote.score * this.multiplier;
      s.score += gained;
      this.fx.push({ kind: 'burst', x: mote.x, y: mote.y, color: mote.color, count: 18, speed: 260, life: 0.7 });
      this.fx.push({ kind: 'text', x: mote.x, y: mote.y - 10, value: `+${gained}`, color: '#ffffff', big: false });
      this.sfx.hit += 1;
      for (let i = 0; i < mote.lumens; i += 1) {
        const angle = random.range(0, Math.PI * 2);
        const speed = random.range(30, 120);
        s.lumens.push({
          x: mote.x,
          y: mote.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: LUMEN.lifeSeconds,
          value: LUMEN.value,
        });
      }
      if (mote.kind === 'splitter') {
        for (let i = 0; i < 2; i += 1) {
          const mini = this.spawnMote('mini', mote.x + (i === 0 ? -14 : 14), mote.y);
          mini.vy = 40;
        }
      }
      if (mote.kind === 'boss') {
        s.boss = null;
        s.score += 500 * this.multiplier;
        this.fx.push({ kind: 'ring', x: mote.x, y: mote.y, color: '#ff2e63', maxRadius: 260 });
        this.fx.push({ kind: 'burst', x: mote.x, y: mote.y, color: '#ff2e63', count: 60, speed: 380, life: 1 });
        for (let i = 0; i < 10; i += 1) {
          const angle = random.range(0, Math.PI * 2);
          s.lumens.push({
            x: mote.x,
            y: mote.y,
            vx: Math.cos(angle) * random.range(60, 200),
            vy: Math.sin(angle) * random.range(60, 200),
            life: LUMEN.lifeSeconds,
            value: LUMEN.value,
          });
        }
      }
    },

    buildSurgeChoices() {
      const s = this.state;
      const available = SURGES.filter((u) => s.upgrades[u.id] < u.max);
      const choices = [];
      while (choices.length < 3 && available.length > 0) {
        const index = Math.floor(random.next() * available.length);
        choices.push(available.splice(index, 1)[0]);
      }
      return choices;
    },

    applySurge(id) {
      const s = this.state;
      if (!s.surgePending) return;
      const choice = s.surgePending.find((c) => c.id === id);
      if (!choice) return;
      s.upgrades[id] += 1;
      if (id === 'hull') s.player.hull = Math.min(PLAYER.maxHull, s.player.hull + 1);
      if (id === 'aegis') s.player.shield = Math.min(2, s.player.shield + 1);
      s.banked -= LUMEN.surgeEvery;
      s.surgePending = null;
      this.sfx.surge += 1;
    },

    hurtPlayer() {
      const s = this.state;
      const p = s.player;
      if (p.shield > 0) {
        p.shield -= 1;
        p.invuln = PLAYER.invulnerableSeconds;
        this.fx.push({ kind: 'ring', x: p.x, y: p.y, color: '#4cc9f0', maxRadius: 90 });
        this.fx.push({ kind: 'text', x: p.x, y: p.y - 30, value: 'AEGIS!', color: '#4cc9f0', big: true });
        return EVENT_HIT;
      }
      p.hull -= 1;
      p.invuln = PLAYER.invulnerableSeconds;
      s.streak = 0;
      s.comboTimer = 0;
      s.shake = 1;
      this.sfx.hurt += 1;
      this.fx.push({ kind: 'burst', x: p.x, y: p.y, color: '#ff5d8f', count: 26, speed: 320, life: 0.8 });
      if (p.hull <= 0) {
        s.over = true;
        this.sfx.over += 1;
        this.fx.push({ kind: 'ring', x: p.x, y: p.y, color: '#ff5d8f', maxRadius: 300 });
        this.fx.push({ kind: 'burst', x: p.x, y: p.y, color: '#ffffff', count: 60, speed: 420, life: 1.1 });
        return EVENT_OVER;
      }
      return EVENT_HIT;
    },

    step(dt, controls, attract) {
      const s = this.state;
      let events = EVENT_NONE;
      this.fx = [];
      s.time += dt;
      const p = s.player;

      if (s.over) {
        s.shake = Math.max(0, s.shake - dt * 1.4);
        return EVENT_NONE;
      }

      // Player movement and aim.
      if (attract) {
        p.x = FIELD.width / 2 + Math.sin(s.time * 0.5) * 120;
        p.y = FIELD.height * 0.62 + Math.sin(s.time * 0.9) * 14;
        p.aim = -Math.PI / 2 + Math.sin(s.time * 0.4) * 0.5;
      } else {
        p.vx += controls.mx * PLAYER.accel * dt;
        p.vy += controls.my * PLAYER.accel * dt;
        const drag = Math.max(0, 1 - PLAYER.drag * dt);
        p.vx *= drag;
        p.vy *= drag;
        const speed = Math.hypot(p.vx, p.vy);
        if (speed > PLAYER.maxSpeed) {
          p.vx = (p.vx / speed) * PLAYER.maxSpeed;
          p.vy = (p.vy / speed) * PLAYER.maxSpeed;
        }
        p.x = Math.min(FIELD.width - PLAYER.radius, Math.max(PLAYER.radius, p.x + p.vx * dt));
        p.y = Math.min(FIELD.height - PLAYER.radius, Math.max(PLAYER.radius, p.y + p.vy * dt));
        p.aim = Math.atan2(controls.aimY - p.y, controls.aimX - p.x);
      }
      p.invuln = Math.max(0, p.invuln - dt);
      p.novaCooldown = Math.max(0, p.novaCooldown - dt);
      s.shake = Math.max(0, s.shake - dt * 1.4);

      // Firing costs light: every bolt spends a lumen of energy.
      p.fireTimer -= dt;
      if (!attract && controls.firing && p.fireTimer <= 0) {
        if (p.energy >= PLAYER.bulletCost) {
          p.energy -= PLAYER.bulletCost;
          p.fireTimer = this.fireInterval();
          this.fireBullets(controls.aimX, controls.aimY);
        } else {
          p.fireTimer = 0.08;
        }
      }

      // Combo decay.
      if (s.comboTimer > 0) {
        s.comboTimer -= dt;
        if (s.comboTimer <= 0) s.streak = 0;
      }

      // Waves.
      if (!attract) {
        if (s.waveState === 'spawning') {
          s.spawnTimer -= dt;
          const interval = Math.max(
            WAVES.spawnIntervalMin,
            WAVES.spawnInterval - 0.05 * (s.wave - 1),
          );
          if (s.spawnTimer <= 0 && s.spawned < s.budget) {
            events |= this.spawnOne();
            s.spawnTimer = interval;
          }
          if (s.spawned >= s.budget && s.motes.length === 0) events |= this.clearWave();
        } else if (s.waveState === 'rest') {
          s.restTimer -= dt;
          if (s.restTimer <= 0) {
            s.wave += 1;
            this.startWave();
          }
        }
        // The boss calls in drifters while it lives.
        if (s.boss) {
          s.bossSpawnTimer -= dt;
          if (s.bossSpawnTimer <= 0 && s.motes.length < 14) {
            this.spawnMote('drifter', random.range(60, FIELD.width - 60), -30);
            this.spawnMote('drifter', random.range(60, FIELD.width - 60), -30);
            s.bossSpawnTimer = 3;
          }
        }
      } else if (s.motes.length < 7 && random.chance(dt * 0.8)) {
        this.spawnMote('drifter', random.range(60, FIELD.width - 60), -30);
      }

      // Bullets.
      for (let i = s.bullets.length - 1; i >= 0; i -= 1) {
        const b = s.bullets[i];
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
          s.bullets.splice(i, 1);
          continue;
        }
        for (let j = s.motes.length - 1; j >= 0; j -= 1) {
          const mote = s.motes[j];
          const rr = mote.radius + 5;
          if (dist2(b.x, b.y, mote.x, mote.y) < rr * rr) {
            this.damageMote(mote, 1);
            if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              s.bullets.splice(i, 1);
            }
            break;
          }
        }
      }

      // Motes.
      for (let i = s.motes.length - 1; i >= 0; i -= 1) {
        const mote = s.motes[i];
        mote.t += dt;
        if (mote.kind === 'drifter' || mote.kind === 'mini') {
          mote.vy = mote.speed;
          mote.vx = Math.sin(mote.t * 2 + mote.seed) * 34;
        } else if (mote.kind === 'weaver') {
          mote.vy = mote.speed;
          mote.vx = Math.sin(mote.t * 3.5 + mote.seed) * 150;
        } else if (mote.kind === 'bruiser') {
          const dx = p.x - mote.x;
          const dy = p.y - mote.y;
          const d = Math.hypot(dx, dy) || 1;
          mote.vx = (dx / d) * mote.speed;
          mote.vy = (dy / d) * mote.speed * 0.7 + 12;
        } else if (mote.kind === 'splitter') {
          mote.vy = mote.speed;
          mote.vx = Math.sin(mote.t * 5 + mote.seed) * 90;
        } else if (mote.kind === 'boss') {
          const dx = p.x - mote.x;
          const dy = p.y - mote.y;
          const d = Math.hypot(dx, dy) || 1;
          mote.vx = (dx / d) * mote.speed;
          mote.vy = Math.max(8, (dy / d) * mote.speed);
          if (mote.y < 110) mote.vy = Math.abs(mote.vy);
        }
        mote.x += mote.vx * dt;
        mote.y += mote.vy * dt;
        if (mote.kind !== 'boss' && (mote.y > FIELD.height + 50 || mote.x < -60 || mote.x > FIELD.width + 60)) {
          s.motes.splice(i, 1);
          continue;
        }
        if (mote.kind === 'boss') {
          mote.x = Math.min(FIELD.width - mote.radius, Math.max(mote.radius, mote.x));
          mote.y = Math.min(FIELD.height * 0.45, Math.max(mote.radius + 40, mote.y));
        }
        // Touching the ship hurts, unless it is still flashing from the last hit.
        if (!attract && p.invuln <= 0) {
          const rr = mote.radius + PLAYER.radius - 4;
          if (dist2(mote.x, mote.y, p.x, p.y) < rr * rr) {
            events |= this.hurtPlayer();
            if (mote.kind !== 'boss') {
              const idx = s.motes.indexOf(mote);
              if (idx >= 0) s.motes.splice(idx, 1);
              this.fx.push({ kind: 'burst', x: mote.x, y: mote.y, color: mote.color, count: 12, speed: 220, life: 0.5 });
            }
            if (s.over) return EVENT_OVER;
          }
        }
      }

      // Lumens drift, get magnetized, get collected.
      const magnetR = this.magnetRadius();
      for (let i = s.lumens.length - 1; i >= 0; i -= 1) {
        const l = s.lumens[i];
        l.life -= dt;
        if (l.life <= 0) {
          s.lumens.splice(i, 1);
          continue;
        }
        const dx = p.x - l.x;
        const dy = p.y - l.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < magnetR) {
          l.vx += (dx / d) * LUMEN.magnetSpeed * dt * 6;
          l.vy += (dy / d) * LUMEN.magnetSpeed * dt * 6;
        } else {
          l.vy += LUMEN.driftSpeed * dt;
          l.vx *= 1 - dt;
          l.vy *= 1 - 0.4 * dt;
        }
        l.x += l.vx * dt;
        l.y += l.vy * dt;
        if (!attract && d < PLAYER.radius + LUMEN.radius + 6) {
          s.lumens.splice(i, 1);
          p.energy = Math.min(PLAYER.maxEnergy, p.energy + l.value);
          s.score += LUMEN.score * this.multiplier;
          s.banked += l.value;
          s.streak += 1;
          s.comboTimer = COMBO.windowSeconds;
          this.sfx.pickup += 1;
          this.fx.push({ kind: 'text', x: l.x, y: l.y - 8, value: `+${LUMEN.score * this.multiplier}`, color: '#ffd166', big: false });
          if (s.banked >= LUMEN.surgeEvery && !s.surgePending) {
            s.surgePending = this.buildSurgeChoices();
            this.sfx.surge += 1;
            events |= EVENT_SURGE;
          }
        }
      }

      return events;
    },
  };

  world.reset();
  return world;
}

// The renderer: every pixel the player sees — the starfield, the ship,
// the motes, the HUD and the screens. It only paints state; it never
// changes it, so a staged state always paints the same frame.
import { COMBO, FIELD, LUMEN, NOVA, PLAYER } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_SURGE = 'surge';

const FONT = (size, weight = 700) => `${weight} ${size}px system-ui, "Segoe UI", sans-serif`;

function makeGlow(color, size = 64) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return c;
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = FIELD.width * DPR;
  canvas.height = FIELD.height * DPR;
  ctx.scale(DPR, DPR);

  // Pre-rendered glow sprites: cheap light, no shadowBlur in the hot loop.
  const glowCyan = makeGlow('#29e6ff');
  const glowGold = makeGlow('#ffd166');
  const glowPink = makeGlow('#ff5d8f');
  const glowViolet = makeGlow('#c77dff');
  const glowWhite = makeGlow('#ffffff');

  // Starfield: three parallax layers, seeded once.
  const layers = [];
  {
    let seed = 1337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let layer = 0; layer < 3; layer += 1) {
      const stars = [];
      const count = [70, 50, 30][layer];
      for (let i = 0; i < count; i += 1) {
        stars.push({
          x: rand() * FIELD.width,
          y: rand() * FIELD.height,
          r: 0.6 + rand() * (layer + 1) * 0.7,
          phase: rand() * Math.PI * 2,
          speed: 0.5 + rand() * 1.5,
        });
      }
      layers.push({ stars, drift: [6, 14, 26][layer] });
    }
  }

  // Nebula: a few soft colour clouds, painted once to an offscreen canvas.
  const nebula = document.createElement('canvas');
  nebula.width = FIELD.width;
  nebula.height = FIELD.height;
  {
    const g = nebula.getContext('2d');
    const blobs = [
      [220, 160, 340, 'rgba(64, 40, 160, 0.55)'],
      [1050, 120, 300, 'rgba(160, 40, 120, 0.4)'],
      [980, 620, 380, 'rgba(20, 90, 140, 0.5)'],
      [180, 600, 300, 'rgba(120, 30, 90, 0.35)'],
      [640, 360, 420, 'rgba(30, 60, 140, 0.35)'],
    ];
    for (const [x, y, r, color] of blobs) {
      const grad = g.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, color);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = grad;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  function drawGlow(sprite, x, y, size, alpha) {
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    ctx.globalAlpha = 1;
  }

  function drawBackground(time) {
    const grad = ctx.createLinearGradient(0, 0, 0, FIELD.height);
    grad.addColorStop(0, '#070818');
    grad.addColorStop(0.55, '#0b1030');
    grad.addColorStop(1, '#12082a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.drawImage(nebula, 0, 0);
    for (const layer of layers) {
      for (const star of layer.stars) {
        const y = (star.y + time * layer.drift) % FIELD.height;
        const tw = 0.55 + 0.45 * Math.sin(time * star.speed + star.phase);
        ctx.globalAlpha = tw;
        ctx.fillStyle = '#dfe8ff';
        ctx.beginPath();
        ctx.arc(star.x, y, star.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawShip(p, time, invuln) {
    const blink = invuln > 0 && Math.floor(time * 14) % 2 === 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.aim + Math.PI / 2);
    if (!blink) {
      drawGlow(glowCyan, 0, 0, 90, 0.8);
      // Engine flame.
      const flame = 14 + Math.sin(time * 31) * 5 + Math.random() * 4;
      ctx.fillStyle = '#ff9f1c';
      ctx.beginPath();
      ctx.moveTo(-6, 14);
      ctx.lineTo(0, 14 + flame);
      ctx.lineTo(6, 14);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(-3.5, 14);
      ctx.lineTo(0, 14 + flame * 0.6);
      ctx.lineTo(3.5, 14);
      ctx.closePath();
      ctx.fill();
      // Hull: a sleek dart.
      const hullGrad = ctx.createLinearGradient(0, -20, 0, 16);
      hullGrad.addColorStop(0, '#eafcff');
      hullGrad.addColorStop(0.5, '#29e6ff');
      hullGrad.addColorStop(1, '#0e7ea6');
      ctx.fillStyle = hullGrad;
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(11, 12);
      ctx.lineTo(5, 8);
      ctx.lineTo(0, 13);
      ctx.lineTo(-5, 8);
      ctx.lineTo(-11, 12);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      // Cockpit.
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -6, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Aegis ring around the ship.
    if (p.shield > 0) {
      ctx.strokeStyle = 'rgba(76, 201, 240, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, PLAYER.radius + 10 + Math.sin(time * 4) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawMote(mote, time) {
    const pulse = 1 + Math.sin(time * 5 + mote.seed) * 0.06;
    const r = mote.radius * pulse;
    ctx.save();
    ctx.translate(mote.x, mote.y);
    drawGlow(mote.kind === 'boss' ? glowPink : glowViolet, 0, 0, r * 4.4, 0.5);
    ctx.fillStyle = hexToRgba(mote.color, 0.28);
    ctx.strokeStyle = mote.color;
    ctx.lineWidth = mote.kind === 'boss' ? 3 : 2;
    if (mote.kind === 'drifter' || mote.kind === 'mini') {
      const spikes = mote.kind === 'mini' ? 6 : 8;
      ctx.rotate(mote.t * 0.8);
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i += 1) {
        const angle = (i / (spikes * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.55;
        const x = Math.cos(angle) * rr;
        const y = Math.sin(angle) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (mote.kind === 'weaver') {
      ctx.rotate(mote.t * 1.6);
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.8, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.8, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (mote.kind === 'bruiser') {
      ctx.rotate(mote.t * 0.4);
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = mote.color;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
      ctx.fill();
    } else if (mote.kind === 'splitter') {
      ctx.rotate(mote.t * 2.2);
      ctx.beginPath();
      for (let i = 0; i < 3; i += 1) {
        const angle = (i / 3) * Math.PI * 2 - Math.PI / 2;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.22, 0, Math.PI * 2);
      ctx.fill();
    } else if (mote.kind === 'boss') {
      ctx.rotate(mote.t * 0.5);
      const spikes = 12;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i += 1) {
        const angle = (i / (spikes * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.62;
        const x = Math.cos(angle) * rr;
        const y = Math.sin(angle) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-mote.t * 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = mote.color;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // Health pips for the tough ones.
    if ((mote.kind === 'bruiser' || mote.kind === 'boss') && mote.hp < mote.maxHp) {
      const w = mote.kind === 'boss' ? 90 : 40;
      const y = mote.y - mote.radius - 12;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(mote.x - w / 2, y, w, 6);
      ctx.fillStyle = '#ff5d8f';
      ctx.fillRect(mote.x - w / 2, y, w * (mote.hp / mote.maxHp), 6);
    }
  }

  function drawLumen(l, time) {
    const pulse = 1 + Math.sin(time * 6 + l.x) * 0.18;
    drawGlow(glowGold, l.x, l.y, 44 * pulse, 0.85);
    ctx.fillStyle = '#ffd166';
    ctx.beginPath();
    ctx.arc(l.x, l.y, LUMEN.radius * pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6d8';
    ctx.beginPath();
    ctx.arc(l.x, l.y, LUMEN.radius * 0.45 * pulse, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBullet(b) {
    drawGlow(glowCyan, b.x, b.y, 26, 0.9);
    ctx.strokeStyle = '#bff6ff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function drawBar(x, y, w, h, frac, fill, back) {
    ctx.fillStyle = back;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, w * Math.max(0, Math.min(1, frac)), h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  function drawHeart(x, y, filled, size) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(size / 16, size / 16);
    ctx.beginPath();
    ctx.moveTo(0, 5);
    ctx.bezierCurveTo(-9, -3, -6, -11, 0, -5);
    ctx.bezierCurveTo(6, -11, 9, -3, 0, 5);
    ctx.closePath();
    ctx.fillStyle = filled ? '#ff5d8f' : 'rgba(255,255,255,0.16)';
    ctx.fill();
    if (filled) {
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHud(state, ui) {
    const p = state.player;
    ctx.textBaseline = 'alphabetic';
    // Score, top left.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = FONT(13, 600);
    ctx.fillText('SCORE', 22, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(30);
    ctx.fillText(String(state.score).padStart(6, '0'), 22, 60);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = FONT(13, 600);
    ctx.fillText(`BEST  ${ui.best}`, 22, 82);
    // Wave, top centre.
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = FONT(13, 600);
    ctx.fillText('WAVE', FIELD.width / 2, 30);
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(30);
    ctx.fillText(String(state.wave), FIELD.width / 2, 60);
    if (state.waveState === 'spawning') {
      const left = state.budget - state.spawned + state.motes.length;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.font = FONT(12, 600);
      ctx.fillText(`${left} HOSTILES LEFT`, FIELD.width / 2, 82);
    } else {
      ctx.fillStyle = '#ffd166';
      ctx.font = FONT(12, 600);
      ctx.fillText('WAVE CLEAR — NEXT INCOMING', FIELD.width / 2, 82);
    }
    // Hull hearts, top right.
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = FONT(13, 600);
    ctx.fillText('HULL', FIELD.width - 22, 30);
    for (let i = 0; i < PLAYER.maxHull; i += 1) {
      drawHeart(FIELD.width - 30 - i * 30, 52, i < p.hull, 15);
    }
    if (p.shield > 0) {
      ctx.fillStyle = '#4cc9f0';
      ctx.font = FONT(12, 700);
      ctx.fillText(`AEGIS ×${p.shield}`, FIELD.width - 22, 82);
    }
    // Lumen energy bar, bottom left.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = FONT(13, 600);
    ctx.fillText('LUMEN  —  LIGHT IS AMMO', 22, FIELD.height - 44);
    const low = p.energy < 12;
    drawBar(22, FIELD.height - 36, 260, 14, p.energy / PLAYER.maxEnergy, low ? '#ff5d8f' : '#ffd166', 'rgba(255,255,255,0.14)');
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(13, 700);
    ctx.fillText(`${Math.floor(p.energy)}`, 292, FIELD.height - 24);
    // Combo, bottom right.
    const mult = ui.multiplier;
    if (mult > 1) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffd166';
      ctx.font = FONT(34);
      ctx.fillText(`×${mult} COMBO`, FIELD.width - 22, FIELD.height - 46);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.font = FONT(12, 600);
      ctx.fillText('KEEP THE STREAK ALIVE', FIELD.width - 22, FIELD.height - 26);
    } else {
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font = FONT(12, 600);
      ctx.fillText('SHIFT / RIGHT-CLICK — NOVA BURST (15 LUMEN)', FIELD.width - 22, FIELD.height - 26);
      if (p.novaCooldown > 0) {
        ctx.fillText(`NOVA RECHARGING ${p.novaCooldown.toFixed(1)}s`, FIELD.width - 22, FIELD.height - 46);
      }
    }
    // Boss bar.
    if (state.boss) {
      const b = state.boss;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff2e63';
      ctx.font = FONT(15, 800);
      ctx.fillText('HOLLOW STAR', FIELD.width / 2, 108);
      drawBar(FIELD.width / 2 - 180, 116, 360, 10, b.hp / b.maxHp, '#ff2e63', 'rgba(255,255,255,0.14)');
    }
    // Mute note.
    if (ui.muted) {
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = FONT(12, 600);
      ctx.fillText('MUTED (M)', FIELD.width - 22, 108);
    }
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(5, 8, 24, 0.82)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(41, 230, 255, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 0.5, y + 0.5, w, h);
  }

  function drawTitle(state, ui) {
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(4, 6, 18, 0.45)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    // Logo.
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(84, 800);
    try { ctx.letterSpacing = '10px'; } catch { /* older canvas: no letter spacing */ }
    ctx.fillText('LUMEN', FIELD.width / 2, 218);
    ctx.fillStyle = '#29e6ff';
    ctx.fillText('HARVEST', FIELD.width / 2, 300);
    try { ctx.letterSpacing = '0px'; } catch { /* noop */ }
    ctx.fillStyle = '#ffd166';
    ctx.font = FONT(20, 600);
    ctx.fillText('THE LAST LIGHT-SHIP  ·  HARVEST THE FALLING STARLIGHT  ·  SPEND IT TO SURVIVE', FIELD.width / 2, 344);
    // How to play.
    panel(FIELD.width / 2 - 330, 380, 660, 148);
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(17, 700);
    ctx.fillText('HOW TO PLAY', FIELD.width / 2, 412);
    ctx.font = FONT(15, 500);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText('WASD / ARROWS — fly      MOUSE — aim      HOLD CLICK / SPACE — fire (costs lumen)', FIELD.width / 2, 444);
    ctx.fillText('Collect golden lumens to reload. Chain kills to raise your combo.', FIELD.width / 2, 470);
    ctx.fillText('Bank 30 lumens for a SURGE upgrade. SHIFT — Nova burst.  P — pause.  M — mute.', FIELD.width / 2, 496);
    if (ui.best > 0) {
      ctx.fillStyle = '#ffd166';
      ctx.font = FONT(17, 700);
      ctx.fillText(`BEST  ${ui.best}`, FIELD.width / 2, 570);
    }
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(22, 800);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillText('CLICK OR PRESS SPACE TO LAUNCH', FIELD.width / 2, 628);
    ctx.globalAlpha = 1;
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(4, 6, 18, 0.6)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(54, 800);
    ctx.fillText('PAUSED', FIELD.width / 2, FIELD.height / 2 - 10);
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.font = FONT(18, 600);
    ctx.fillText('Press P or click to resume', FIELD.width / 2, FIELD.height / 2 + 34);
  }

  function drawOver(state, ui) {
    ctx.fillStyle = 'rgba(8, 4, 16, 0.62)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5d8f';
    ctx.font = FONT(64, 800);
    ctx.fillText('SIGNAL LOST', FIELD.width / 2, 218);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = FONT(19, 600);
    ctx.fillText('The Kestrel went dark over the drift. The harvest remembers you.', FIELD.width / 2, 258);
    panel(FIELD.width / 2 - 260, 300, 520, 190);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = FONT(14, 600);
    ctx.fillText('FINAL SCORE', FIELD.width / 2, 336);
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(52, 800);
    ctx.fillText(String(state.score), FIELD.width / 2, 392);
    ctx.fillStyle = ui.best > 0 && state.score >= ui.best ? '#ffd166' : 'rgba(255,255,255,0.7)';
    ctx.font = FONT(16, 700);
    ctx.fillText(state.score >= ui.best && state.score > 0 ? `NEW BEST!  ${ui.best}` : `BEST  ${ui.best}`, FIELD.width / 2, 424);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = FONT(15, 600);
    const acc = state.shotsFired > 0 ? Math.min(100, Math.round((state.shotsHit / state.shotsFired) * 100)) : 0;
    ctx.fillText(`WAVE ${state.wave}   ·   ${state.kills} MOTES DOWN   ·   ${acc}% ACCURACY`, FIELD.width / 2, 462);
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(22, 800);
    const pulse = 0.65 + 0.35 * Math.sin(state.time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillText('PRESS R OR CLICK TO FLY AGAIN', FIELD.width / 2, 560);
    ctx.globalAlpha = 1;
  }

  function drawSurge(state, ui) {
    ctx.fillStyle = 'rgba(4, 6, 18, 0.66)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd166';
    ctx.font = FONT(46, 800);
    ctx.fillText('SURGE!', FIELD.width / 2, 150);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = FONT(18, 600);
    ctx.fillText('You banked 30 lumens. Choose one upgrade — the drift does not wait.', FIELD.width / 2, 188);
    const choices = ui.surgeChoices || [];
    const cardW = 300;
    const cardH = 210;
    const gap = 28;
    const totalW = choices.length * cardW + (choices.length - 1) * gap;
    let x = FIELD.width / 2 - totalW / 2;
    const y = 250;
    choices.forEach((choice, i) => {
      const hover = ui.hoverIndex === i;
      ctx.fillStyle = hover ? 'rgba(41, 230, 255, 0.16)' : 'rgba(5, 8, 24, 0.88)';
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeStyle = hover ? '#29e6ff' : 'rgba(255,255,255,0.3)';
      ctx.lineWidth = hover ? 2.5 : 1.5;
      ctx.strokeRect(x + 0.5, y + 0.5, cardW, cardH);
      ctx.fillStyle = '#29e6ff';
      ctx.font = FONT(15, 800);
      ctx.fillText(`[${i + 1}]`, x + cardW / 2, y + 42);
      ctx.fillStyle = '#ffffff';
      ctx.font = FONT(24, 800);
      ctx.fillText(choice.name, x + cardW / 2, y + 84);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = FONT(15, 600);
      ctx.fillText(choice.desc, x + cardW / 2, y + 116);
      // Level pips.
      const level = state.upgrades[choice.id] || 0;
      for (let p = 0; p < choice.max; p += 1) {
        ctx.fillStyle = p < level ? '#ffd166' : 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.arc(x + cardW / 2 - (choice.max - 1) * 11 + p * 22, y + 152, 6, 0, Math.PI * 2);
        ctx.fill();
      }
      x += cardW + gap;
    });
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = FONT(14, 600);
    ctx.fillText('Click a card or press 1 / 2 / 3', FIELD.width / 2, y + cardH + 46);
  }

  function drawWaveBanner(state) {
    if (!state.banner) return;
    const age = state.time - state.banner.at;
    if (age > 2.2) return;
    const alpha = age < 0.3 ? age / 0.3 : age > 1.7 ? (2.2 - age) / 0.5 : 1;
    ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = FONT(46, 800);
    ctx.fillText(state.banner.text, FIELD.width / 2, 300);
    ctx.globalAlpha = 1;
  }

  return {
    draw(state, screen, ui, particles) {
      const time = state.time;
      ctx.save();
      if (state.shake > 0) {
        const mag = state.shake * 9;
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
      }
      drawBackground(time);
      // World entities.
      for (const l of state.lumens) drawLumen(l, time);
      for (const mote of state.motes) drawMote(mote, time);
      for (const b of state.bullets) drawBullet(b);
      if (screen !== SCREEN_TITLE) drawShip(state.player, time, state.player.invuln);
      else drawShip(state.player, time, 0);
      // Particles, rings and floating text.
      if (particles) {
        for (const p of particles.sparks) {
          ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        for (const r of particles.rings) {
          ctx.globalAlpha = Math.max(0, r.life / r.maxLife);
          ctx.strokeStyle = r.color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(r.x, r.y, r.radius, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        ctx.textAlign = 'center';
        for (const t of particles.texts) {
          ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
          ctx.fillStyle = t.color;
          ctx.font = FONT(t.big ? 26 : 16, 800);
          ctx.fillText(t.value, t.x, t.y);
        }
        ctx.globalAlpha = 1;
      }
      if (screen === SCREEN_PLAY || screen === SCREEN_SURGE || screen === SCREEN_PAUSED) {
        drawHud(state, ui);
        drawWaveBanner(state);
      }
      if (screen === SCREEN_TITLE) drawTitle(state, ui);
      if (screen === SCREEN_SURGE) drawSurge(state, ui);
      if (screen === SCREEN_PAUSED) drawPaused();
      if (screen === SCREEN_OVER) drawOver(state, ui);
      ctx.restore();
    },
  };
}

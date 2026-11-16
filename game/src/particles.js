// Particles, shockwave rings and floating score text: every bit of juice
// the game shows when something is shot, collected or broken.
export function createParticles() {
  const sparks = [];
  const rings = [];
  const texts = [];

  return {
    burst(x, y, color, count, speed, life) {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const v = speed * (0.3 + Math.random() * 0.7);
        sparks.push({
          x, y,
          vx: Math.cos(angle) * v,
          vy: Math.sin(angle) * v,
          life: life * (0.5 + Math.random() * 0.5),
          maxLife: life,
          size: 1.5 + Math.random() * 2.5,
          color,
        });
      }
    },
    ring(x, y, color, maxRadius) {
      rings.push({ x, y, radius: 8, maxRadius, color, life: 0.5, maxLife: 0.5 });
    },
    text(x, y, value, color, big) {
      texts.push({ x, y, value, color, life: 1.1, maxLife: 1.1, big: !!big });
    },
    step(dt) {
      for (let i = sparks.length - 1; i >= 0; i -= 1) {
        const p = sparks[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 1 - 2.4 * dt;
        p.vy *= 1 - 2.4 * dt;
        p.life -= dt;
        if (p.life <= 0) sparks.splice(i, 1);
      }
      for (let i = rings.length - 1; i >= 0; i -= 1) {
        const r = rings[i];
        r.life -= dt;
        r.radius += (r.maxRadius - r.radius) * 6 * dt;
        if (r.life <= 0) rings.splice(i, 1);
      }
      for (let i = texts.length - 1; i >= 0; i -= 1) {
        const t = texts[i];
        t.y -= 42 * dt;
        t.life -= dt;
        if (t.life <= 0) texts.splice(i, 1);
      }
    },
    get sparks() {
      return sparks;
    },
    get rings() {
      return rings;
    },
    get texts() {
      return texts;
    },
    get count() {
      return sparks.length + rings.length + texts.length;
    },
  };
}

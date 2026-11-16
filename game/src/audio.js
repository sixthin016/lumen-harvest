// Procedural sound: every effect is synthesized with WebAudio oscillators
// and noise, so the game ships no audio files and never fetches anything.
export function createAudio() {
  let ctx = null;
  let muted = false;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume();
      return ctx;
    }
    const AudioCtx = window.AudioContext ?? window.webkitAudioContext;
    if (!AudioCtx) return null;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0.22;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    const now = ac.currentTime;
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), now + dur);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  function noise(dur, vol, lowpass) {
    if (muted) return;
    const ac = ensure();
    if (!ac) return;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buffer = ac.createBuffer(1, len, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = lowpass;
    const gain = ac.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start();
  }

  return {
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      return muted;
    },
    get muted() {
      return muted;
    },
    shoot() {
      tone(880, 0.08, 'square', 0.12, 220);
    },
    hit() {
      noise(0.12, 0.25, 900);
      tone(180, 0.12, 'sawtooth', 0.14, 60);
    },
    pickup(combo) {
      const base = 520 + Math.min(combo, 8) * 40;
      tone(base, 0.09, 'sine', 0.16, base * 1.5);
    },
    hurt() {
      tone(140, 0.3, 'sawtooth', 0.3, 40);
      noise(0.25, 0.3, 500);
    },
    surge() {
      tone(392, 0.12, 'sine', 0.2);
      setTimeout(() => tone(523, 0.12, 'sine', 0.2), 90);
      setTimeout(() => tone(784, 0.2, 'sine', 0.22), 180);
    },
    nova() {
      noise(0.5, 0.4, 2400);
      tone(90, 0.5, 'sine', 0.3, 30);
    },
    waveClear() {
      tone(523, 0.1, 'triangle', 0.2);
      setTimeout(() => tone(659, 0.1, 'triangle', 0.2), 100);
      setTimeout(() => tone(880, 0.22, 'triangle', 0.22), 200);
    },
    boss() {
      tone(65, 0.6, 'sawtooth', 0.28, 45);
      tone(98, 0.6, 'sawtooth', 0.18, 60);
    },
    over() {
      tone(330, 0.25, 'triangle', 0.22, 220);
      setTimeout(() => tone(262, 0.25, 'triangle', 0.22), 220);
      setTimeout(() => tone(196, 0.5, 'triangle', 0.24), 440);
    },
  };
}

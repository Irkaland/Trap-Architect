// Small synthesized sound effects (no audio files). Off by default.
export type Sfx = 'move' | 'push' | 'blocked' | 'door' | 'zap' | 'win' | 'undo' | 'place';

let ctx: AudioContext | null = null;
let enabled = false;

export function setSoundEnabled(on: boolean): void {
  enabled = on;
  if (on) ensure();
}

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, delay = 0, slideTo?: number): void {
  const c = ensure();
  if (!c) return;
  if (c.state === 'suspended') void c.resume();
  const t0 = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

export function play(s: Sfx): void {
  if (!enabled) return;
  switch (s) {
    case 'move': tone(520, 0.06, 'triangle', 0.05); break;
    case 'push': tone(180, 0.12, 'square', 0.04, 0, 120); break;
    case 'blocked': tone(120, 0.08, 'sine', 0.06); break;
    case 'door': tone(392, 0.1, 'triangle', 0.05); tone(587, 0.12, 'triangle', 0.05, 0.07); break;
    case 'zap': tone(880, 0.25, 'sawtooth', 0.05, 0, 110); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.06, i * 0.09)); break;
    case 'undo': tone(440, 0.06, 'triangle', 0.04, 0, 330); break;
    case 'place': tone(660, 0.05, 'triangle', 0.04); break;
  }
}

/**
 * Quiet sounds, synthesized on the phone: nothing recorded, nothing downloaded. Off unless the
 * player turns them on. Every cue is short and soft enough for a cabin.
 */
import { settings } from './settings';

export type Cue = 'place' | 'buy' | 'seal' | 'shatter' | 'refuse' | 'hit' | 'cast' | 'fall' | 'win' | 'lose' | 'pick';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const lastPlayed = new Map<Cue, number>();
/** The fewest milliseconds between two plays of a cue, so a busy clash stays a murmur. */
const SPACING: Partial<Record<Cue, number>> = { hit: 90, cast: 120, fall: 60, place: 40 };

function audio(): AudioContext | null {
  if (ctx) return ctx;
  const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
    ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.22;
  master.connect(ctx.destination);
  return ctx;
}

/** Phones only allow sound after a touch; call this from a tap to wake the audio. */
export function unlockAudio() {
  if (!settings.value.sound) return;
  const a = audio();
  if (a?.state === 'suspended') void a.resume();
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, peak: number, glide?: number) {
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, start);
  if (glide) o.frequency.exponentialRampToValueAtTime(glide, start + dur);
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(peak, start + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  o.connect(g).connect(master!);
  o.start(start); o.stop(start + dur + 0.02);
}

function noise(a: AudioContext, start: number, dur: number, peak: number, filter: BiquadFilterType, freq: number) {
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  // A fixed pattern, not Math.random: the same cue always sounds the same.
  let x = 0x2545f491;
  for (let i = 0; i < len; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; d[i] = ((x >>> 0) / 4294967296) * 2 - 1; }
  const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
  src.buffer = buf; f.type = filter; f.frequency.value = freq;
  g.gain.setValueAtTime(peak, start);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(f).connect(g).connect(master!);
  src.start(start);
}

export function play(cue: Cue) {
  if (!settings.value.sound) return;
  const a = audio();
  if (!a || a.state !== 'running') { if (a?.state === 'suspended') void a.resume(); if (!a || a.state !== 'running') return; }
  const now = performance.now();
  const gap = SPACING[cue];
  if (gap && now - (lastPlayed.get(cue) ?? -1e9) < gap) return;
  lastPlayed.set(cue, now);
  const t = a.currentTime + 0.005;
  switch (cue) {
    case 'place': noise(a, t, 0.05, 0.5, 'bandpass', 1800); tone(a, 520, t, 0.06, 'triangle', 0.15); break;
    case 'buy': tone(a, 1568, t, 0.09, 'sine', 0.18); tone(a, 2093, t + 0.05, 0.12, 'sine', 0.14); break;
    case 'seal': tone(a, 784, t, 0.5, 'sine', 0.22); tone(a, 1175, t + 0.06, 0.55, 'sine', 0.16); tone(a, 1568, t + 0.12, 0.6, 'sine', 0.1); break;
    case 'shatter': noise(a, t, 0.22, 0.6, 'highpass', 2500); tone(a, 1900, t, 0.12, 'square', 0.04, 900); break;
    case 'refuse': tone(a, 196, t, 0.12, 'triangle', 0.18); tone(a, 185, t + 0.09, 0.12, 'triangle', 0.14); break;
    case 'hit': noise(a, t, 0.04, 0.25, 'lowpass', 900); break;
    case 'cast': tone(a, 440, t, 0.18, 'sine', 0.1, 880); break;
    case 'fall': tone(a, 220, t, 0.25, 'sine', 0.16, 110); break;
    case 'pick': tone(a, 988, t, 0.12, 'sine', 0.16); tone(a, 1319, t + 0.07, 0.18, 'sine', 0.12); break;
    case 'win': [523, 659, 784, 1047].forEach((f, i) => tone(a, f, t + i * 0.11, 0.35, 'sine', 0.18)); break;
    case 'lose': [392, 330, 262].forEach((f, i) => tone(a, f, t + i * 0.16, 0.4, 'triangle', 0.14)); break;
  }
}

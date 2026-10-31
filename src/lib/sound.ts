// Countdown cues. Audio needs a user gesture first, so the context is created on the first tap.
//
// Cues are scheduled ahead on the audio clock rather than played from a JS timer: in the background Chrome
// throttles timers to once a second and lets a silent audio output go to sleep, which made the first beep late.
// A near-silent tone keeps the output awake while a countdown runs.

import type { Cue } from './logic/rest';

let ctx: AudioContext | null = null;
let wave: PeriodicWave | null = null;

export function unlockSound() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    ctx = null;
  }
}

type Kind = Cue['kind'];

/** Each cue's pitch, length and the offsets of its beeps (the 10 s cue is a double beep). */
const TONES: Record<Kind, { freq: number; dur: number; at: number[] }> = {
  ten: { freq: 660, dur: 0.1, at: [0, 0.18] },
  tick: { freq: 880, dur: 0.12, at: [0] },
  end: { freq: 1046, dur: 0.6, at: [0] },
};

/** A second harmonic makes the beep cut through music better than a pure sine. */
const HARMONIC = 0.35;

function tone(c: AudioContext, at: number, kind: Kind, volume: number): OscillatorNode[] {
  wave ??= c.createPeriodicWave(new Float32Array([0, 0, 0]), new Float32Array([0, 1, HARMONIC]));
  const { freq, dur, at: offsets } = TONES[kind];
  return offsets.map((o) => {
    const t = at + o;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.setPeriodicWave(wave!);
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
    return osc;
  });
}

/** Play a cue now, e.g. to try the volume. */
export function beep(kind: Kind, volume: number) {
  if (ctx?.state === 'running') tone(ctx, ctx.currentTime, kind, volume);
}

export interface CueOptions {
  soundVolume: number;
  pauseMusic: boolean;
}

let scheduled: OscillatorNode[] = [];
let clipTimer: ReturnType<typeof setTimeout> | undefined;
let clip: HTMLAudioElement | null = null;
let token = 0;

/** Stop everything scheduled by `scheduleCues`. */
export function cancelCues() {
  token++;
  scheduled.forEach(stopQuietly);
  scheduled = [];
  clearTimeout(clipTimer);
  clip?.pause();
  clip = null;
}

/** Schedule a countdown's cues for a timer ending at `endsAt` (epoch ms), replacing any scheduled before. */
export function scheduleCues(endsAt: number, cues: Cue[], opts: CueOptions) {
  cancelCues();
  const c = ctx;
  if (!c) return;
  if (c.state !== 'running') {
    // The clock doesn't move while suspended; schedule once it runs again.
    const mine = token;
    void c.resume().then(() => mine === token && c.state === 'running' && scheduleCues(endsAt, cues, opts));
    return;
  }
  const late = opts.pauseMusic ? cues.filter((q) => q.beforeEndMs <= CLIP_SPAN_MS) : [];
  const now = Date.now();
  const at = (q: Cue) => (endsAt - q.beforeEndMs - now) / 1000;
  // Every cue goes on the audio clock, which keeps time while the page's timers are throttled. The clip's cues
  // stay there as a backup until the clip starts playing.
  const backup: OscillatorNode[] = [];
  for (const q of cues) {
    if (at(q) <= -0.05) continue;
    const oscs = tone(c, c.currentTime + Math.max(0, at(q)), q.kind, opts.soundVolume);
    scheduled.push(...oscs);
    if (late.includes(q)) backup.push(...oscs);
  }
  if (late.length) scheduleClip(endsAt, late, opts.soundVolume, backup);
  keepAwake(c, Math.max(0, (endsAt - now) / 1000) + 1);
}

/** Keep the output from sleeping until `untilSec` from now: a 40 Hz tone at about -80 dB, far below hearing. */
function keepAwake(c: AudioContext, untilSec: number) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.frequency.value = 40;
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(c.destination);
  osc.start();
  osc.stop(c.currentTime + untilSec);
  scheduled.push(osc);
}

// The final cues as a short clip in an <audio> element. Chrome on Android asks for transient audio focus for
// clips under 5 s, so music apps pause (or duck) while it plays and carry on after. The clip opens with a second
// of silence: when the timer that starts it fires late, playback skips ahead by the delay to stay on time.
// A JS timer starts the clip, and in the background it can fire seconds late or not until the page is opened
// again; the backup beeps on the audio clock cover that, and are stopped once the clip plays.

const CLIP_LEAD_MS = 1000;
/** Cues this many ms before the end or later go in the clip. */
const CLIP_SPAN_MS = 3000;
const RATE = 22_050;
const clips = new Map<string, string>();

function scheduleClip(endsAt: number, cues: Cue[], volume: number, backup: OscillatorNode[]) {
  const startAt = endsAt - CLIP_SPAN_MS - CLIP_LEAD_MS;
  const mine = token;
  let url: string;
  try {
    url = clipUrl(cues);
  } catch {
    return;
  }
  clipTimer = setTimeout(() => {
    if (mine !== token) return;
    const offset = Math.max(0, Date.now() - startAt) / 1000;
    if (offset > (CLIP_LEAD_MS + CLIP_SPAN_MS) / 1000) return;
    const audio = new Audio(url);
    audio.volume = volume;
    audio.currentTime = offset;
    clip = audio;
    // Beeps already past stay played; the clip, started at the matching offset, plays only the rest.
    audio.addEventListener('playing', () => mine === token && backup.forEach(stopQuietly), { once: true });
    audio.play().catch(() => undefined);
  }, Math.max(0, startAt - Date.now()));
}

function stopQuietly(osc: OscillatorNode) {
  try {
    osc.stop();
  } catch {
    // Already stopped.
  }
}

/** A WAV file (16-bit mono) with the cues at their places after the lead-in, cached per set of cues. */
function clipUrl(cues: Cue[]): string {
  const key = cues.map((q) => `${q.kind}${q.beforeEndMs}`).join();
  const cached = clips.get(key);
  if (cached) return cached;
  const total = Math.ceil(((CLIP_LEAD_MS + CLIP_SPAN_MS) / 1000 + TONES.end.dur + 0.1) * RATE);
  const pcm = new Float32Array(total);
  for (const q of cues) {
    const { freq, dur, at } = TONES[q.kind];
    for (const o of at) {
      const start = Math.round(((CLIP_LEAD_MS + CLIP_SPAN_MS - q.beforeEndMs) / 1000 + o) * RATE);
      const n = Math.round(dur * RATE);
      for (let i = 0; i < n && start + i < total; i++) {
        const t = i / RATE;
        // 10 ms attack, then an exponential fade to silence by the end of the beep.
        const env = Math.min(1, t / 0.01) * Math.exp((-t / dur) * 7);
        const w = 2 * Math.PI * freq * t;
        pcm[start + i] += (env * (Math.sin(w) + HARMONIC * Math.sin(2 * w))) / (1 + HARMONIC);
      }
    }
  }
  const url = URL.createObjectURL(new Blob([wav(pcm)], { type: 'audio/wav' }));
  clips.set(key, url);
  return url;
}

function wav(pcm: Float32Array): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const text = (at: number, s: string) => [...s].forEach((ch, i) => v.setUint8(at + i, ch.charCodeAt(0)));
  text(0, 'RIFF');
  v.setUint32(4, 36 + pcm.length * 2, true);
  text(8, 'WAVEfmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true);
  v.setUint32(28, RATE * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  text(36, 'data');
  v.setUint32(40, pcm.length * 2, true);
  pcm.forEach((x, i) => v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 0x7fff, true));
  return buf;
}

export function buzz(pattern: number | number[]) {
  navigator.vibrate?.(pattern);
}

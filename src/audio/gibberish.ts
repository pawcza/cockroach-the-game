/**
 * The bosses' gibberish voice: a tiny speech synth that turns a line of text into a stream of short syllables, one per
 * letter, in the Rayman 2 manner. It is all Web Audio, built at runtime from oscillators and filters, so there are no
 * audio files and nothing sampled.
 *
 * A syllable is a voiced blip: an oscillator through three formant band-pass filters (the vowel is picked from the
 * letter, so a letter always sounds the same) with a fast attack and decay and a little random pitch jitter. Spaces
 * only breathe, commas and full stops pause, a "?" lifts the last word and a "!" makes it louder and longer. Each boss
 * has a voice preset (pitch, range, formants, speed, wave) and an effect on top: Lodzia is shrill and quick, Bigos is
 * a ring-modulated vocoder in a minor scale, Zlewiatan is three wet gurgling voices, Eksterminator talks through a gas
 * mask and hisses at the end of a sentence.
 *
 * Planning (text to timed syllables) is plain data and Math-only, so it can be tested; rendering takes any
 * BaseAudioContext, the live one in the game or an OfflineAudioContext for a file. Everything is cosmetic: it uses
 * Math.random, never the seeded RNG a match shares.
 */
import type Phaser from 'phaser';
import { getSfxVolume } from '../utils/Storage';

export type VoiceId = 'lodzia' | 'bigos' | 'zlewiatan' | 'eksterminator';
type Vowel = 'a' | 'e' | 'i' | 'o' | 'u';
type Effect = 'none' | 'ring' | 'choir' | 'mask';

export interface VoiceDef {
  wave: OscillatorType;
  /** Hz, the lowest note a letter can take. */
  basePitch: number;
  /** Semitones from the lowest note to the highest. */
  range: number;
  /** Notes a letter can take, in semitones from the base. Without it the pitch is continuous across the range. */
  scale?: number[];
  /** Multiplies every formant: above 1 is a smaller, shriller throat. */
  formantScale: number;
  /** Milliseconds per letter. */
  speed: number;
  /** Long and short letters alternate by this much (0..1), for a bouncy rhythm. */
  swing: number;
  /** Random pitch wobble per syllable, in cents. */
  jitter: number;
  vibrato?: { rate: number; depth: number };
  /** How much of a narrow 1 kHz band is added, for a nasal voice. */
  nasal: number;
  effect: Effect;
  /** Trim so every voice peaks at about the same level before the compressor (found by rendering each offline). */
  level: number;
}

export const VOICES: Record<VoiceId, VoiceDef> = {
  lodzia: {
    wave: 'sawtooth', basePitch: 330, range: 9, formantScale: 1.2, speed: 50, swing: 0.1, jitter: 28,
    vibrato: { rate: 9, depth: 40 }, nasal: 0.7, effect: 'none', level: 0.45,
  },
  bigos: {
    wave: 'square', basePitch: 110, range: 24, scale: [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24], formantScale: 1.05,
    speed: 74, swing: 0.3, jitter: 0, nasal: 0, effect: 'ring', level: 0.55,
  },
  zlewiatan: {
    wave: 'sawtooth', basePitch: 92, range: 6, formantScale: 0.8, speed: 80, swing: 0.12, jitter: 18,
    nasal: 0, effect: 'choir', level: 1.8,
  },
  eksterminator: {
    wave: 'sawtooth', basePitch: 88, range: 3, formantScale: 0.84, speed: 98, swing: 0, jitter: 6,
    nasal: 0, effect: 'mask', level: 1,
  },
};

/** Formant frequencies (F1, F2, F3) of each vowel, for an adult male throat. */
const FORMANTS: Record<Vowel, [number, number, number]> = {
  a: [800, 1200, 2500],
  e: [500, 1900, 2600],
  i: [300, 2300, 3000],
  o: [500, 900, 2400],
  u: [320, 800, 2300],
};
const FORMANT_Q: [number, number, number] = [7, 9, 11];
const FORMANT_GAIN: [number, number, number] = [1, 0.7, 0.35];

const VOWELS: Vowel[] = ['a', 'e', 'i', 'o', 'u'];
const VOWEL_OF: Record<string, Vowel> = { a: 'a', ą: 'o', e: 'e', ę: 'e', i: 'i', y: 'i', o: 'o', ó: 'o', u: 'u' };

const LETTER = /[\p{L}\p{N}]/u;
const PAUSE_MARKS = new Set([',', ';', ':', '–', '—']);
const STOP_MARKS = new Set(['.', '…', '!', '?']);

export interface Syllable {
  /** Seconds from the start of the line. */
  at: number;
  dur: number;
  index: number;
  vowel: Vowel;
  /** Hz, at the start and at the end of the blip. */
  pitch: number;
  pitchEnd: number;
  gain: number;
}

export interface CharEvent {
  /** Seconds from the start of the line. */
  at: number;
  index: number;
  char: string;
  /** Carries a syllable: spaces and punctuation do not. */
  voiced: boolean;
}

export interface SpeechPlan {
  syllables: Syllable[];
  /** One per character of the text, in order, for revealing it in step with the voice. */
  chars: CharEvent[];
  /** Where a sentence ends, in seconds: the mask's breath goes out here. */
  sentenceEnds: number[];
  /** Seconds, until the last syllable or pause is over. */
  duration: number;
}

const semitone = (n: number): number => Math.pow(2, n / 12);

/** The same letter always lands on the same slot, whatever the boss. */
function letterSlot(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  return (code * 7 + (code >> 3)) % 11;
}

function vowelOf(ch: string): { vowel: Vowel; isVowel: boolean } {
  const direct = VOWEL_OF[ch];
  if (direct) return { vowel: direct, isVowel: true };
  const code = ch.codePointAt(0) ?? 0;
  return { vowel: VOWELS[(code * 3 + (code >> 2)) % VOWELS.length], isVowel: false };
}

/** The note a letter takes, in semitones above the voice's base. */
function noteOf(def: VoiceDef, slot: number): number {
  if (def.scale) return def.scale[slot % def.scale.length];
  return (slot / 10) * def.range;
}

/**
 * Turns text into timed syllables. Same text, same voice, same plan, apart from the jitter the rng adds to the pitch.
 */
export function planSpeech(def: VoiceDef, text: string, rng: () => number = Math.random): SpeechPlan {
  const chars = Array.from(text);
  const unit = def.speed / 1000;

  // The last word before a "!" or "?" gets its contour; found first so the pass below can just look it up
  const shape: ('excl' | 'quest' | null)[] = chars.map(() => null);
  const wordPos: number[] = chars.map(() => 0);
  const wordLen: number[] = chars.map(() => 0);
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== '!' && chars[i] !== '?') continue;
    const end = i;
    let start = end;
    while (start > 0 && LETTER.test(chars[start - 1])) start--;
    for (let k = start; k < end; k++) {
      shape[k] = chars[i] === '!' ? 'excl' : 'quest';
      wordPos[k] = k - start;
      wordLen[k] = end - start;
    }
  }

  const syllables: Syllable[] = [];
  const events: CharEvent[] = [];
  const sentenceEnds: number[] = [];
  let t = 0;
  let letters = 0;
  let sinceStop = 0;

  chars.forEach((raw, index) => {
    const ch = raw.toLowerCase();
    if (LETTER.test(ch)) {
      const swing = letters % 2 === 0 ? 1 + def.swing : 1 - def.swing;
      const { vowel, isVowel } = vowelOf(ch);
      const slot = letterSlot(ch);
      let step = unit * swing * (isVowel ? 1.1 : 0.92);
      let gain = isVowel ? 1 : 0.8;
      let note = noteOf(def, slot);
      // Pitch sags a little over a sentence, as a voice does (not on a scale, which would be knocked off it)
      if (!def.scale) note -= Math.min(sinceStop, 24) * 0.12;
      let lift = 0;
      const kind = shape[index];
      if (kind === 'excl') {
        gain *= 1.35;
        step *= 1.25;
        note += 1.5;
      } else if (kind === 'quest') {
        // The last word climbs: each letter higher than the one before, up to a fourth
        lift = ((wordPos[index] + 1) / Math.max(1, wordLen[index])) * 5;
      }
      note += lift;
      const jitterCents = (rng() * 2 - 1) * def.jitter;
      const pitch = def.basePitch * semitone(note + jitterCents / 100);
      const pitchEnd = def.basePitch * semitone(note + jitterCents / 100 + (kind === 'quest' ? 1.2 : -0.6));
      syllables.push({ at: t, dur: Math.min(step * 0.9, 0.3), index, vowel, pitch, pitchEnd, gain });
      events.push({ at: t, index, char: raw, voiced: true });
      t += step;
      letters++;
      sinceStop++;
    } else if (/\s/.test(ch)) {
      events.push({ at: t, index, char: raw, voiced: false });
      t += unit * 0.5;
    } else if (PAUSE_MARKS.has(ch)) {
      events.push({ at: t, index, char: raw, voiced: false });
      t += unit * 3.2;
    } else if (STOP_MARKS.has(ch)) {
      events.push({ at: t, index, char: raw, voiced: false });
      sentenceEnds.push(t);
      t += unit * 5;
      sinceStop = 0;
    } else {
      events.push({ at: t, index, char: raw, voiced: false });
      t += unit * 0.15;
    }
  });
  if (letters > 0 && sinceStop > 0) sentenceEnds.push(t);

  return { syllables, chars: events, sentenceEnds, duration: t };
}

// ── Rendering ────────────────────────────────────────────────────────

/** A head of the choir: Zlewiatan's three voices. */
const CHOIR = [
  { mul: 1, formant: 0.92, delay: 0, detune: -14, gain: 0.5, wobble: 11 },
  { mul: 0.84, formant: 1.08, delay: 0.014, detune: 9, gain: 0.5, wobble: 14.5 },
  { mul: 1.19, formant: 0.82, delay: 0.029, detune: 3, gain: 0.5, wobble: 8.5 },
];
const SINGLE = [{ mul: 1, formant: 1, delay: 0, detune: 0, gain: 1, wobble: 0 }];

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  let buffer = noiseBuffers.get(ctx);
  if (!buffer) {
    buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * 1.5), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    noiseBuffers.set(ctx, buffer);
  }
  return buffer;
}

/** What a line's syllables all feed: the effect's shared nodes, which end in `dest`. */
interface Bus {
  /** Where each syllable's voice goes. */
  input: AudioNode;
  /** The mask's breath at the end of a sentence. */
  hiss?: (at: number) => void;
}

/** Soft clip: nothing leaves the voice bus above ±1, however the voices stack. */
function softClipCurve(): Float32Array<ArrayBuffer> {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) curve[i] = Math.tanh((i / (n - 1)) * 4 - 2) / Math.tanh(2) * 0.98;
  return curve;
}

function buildBus(ctx: BaseAudioContext, def: VoiceDef, dest: AudioNode): Bus {
  if (def.effect === 'choir') {
    const input = ctx.createGain();
    // Wet and a little muffled, like talking from inside a pipe
    const muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 2200;
    input.connect(muffle);
    muffle.connect(dest);
    const delay = ctx.createDelay(0.2);
    delay.delayTime.value = 0.06;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.28;
    const wet = ctx.createGain();
    wet.gain.value = 0.38;
    muffle.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(dest);
    return { input };
  }
  if (def.effect === 'mask') {
    const input = ctx.createGain();
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 780;
    lowpass.Q.value = 0.8;
    input.connect(lowpass);
    lowpass.connect(dest);
    const hiss = (at: number): void => {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      const high = ctx.createBiquadFilter();
      high.type = 'highpass';
      high.frequency.value = 3200;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.1, at + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0005, at + 0.4);
      src.connect(high);
      high.connect(gain);
      gain.connect(dest);
      src.start(at);
      src.stop(at + 0.45);
    };
    return { input, hiss };
  }
  if (def.effect === 'none') {
    // Shrill: nothing under the throat's edge
    const input = ctx.createGain();
    const high = ctx.createBiquadFilter();
    high.type = 'highpass';
    high.frequency.value = 220;
    input.connect(high);
    high.connect(dest);
    return { input };
  }
  const input = ctx.createGain();
  input.connect(dest);
  return { input };
}

function syllableNodes(ctx: BaseAudioContext, def: VoiceDef, bus: Bus, s: Syllable, start: number, rng: () => number): void {
  const heads = def.effect === 'choir' ? CHOIR : SINGLE;
  const formants = FORMANTS[s.vowel];

  for (const head of heads) {
    const t0 = start + head.delay;
    const end = t0 + s.dur;

    const osc = ctx.createOscillator();
    osc.type = def.wave;
    osc.frequency.setValueAtTime(s.pitch * head.mul, t0);
    osc.frequency.exponentialRampToValueAtTime(s.pitchEnd * head.mul, end);
    osc.detune.value = head.detune;
    const sources: OscillatorNode[] = [osc];
    if (def.effect === 'ring') {
      // A saw a hair off the square thickens it, the way a vocoder's carrier is
      const saw = ctx.createOscillator();
      saw.type = 'sawtooth';
      saw.frequency.setValueAtTime(s.pitch, t0);
      saw.frequency.exponentialRampToValueAtTime(s.pitchEnd, end);
      saw.detune.value = 7;
      sources.push(saw);
    }

    const mix = ctx.createGain();
    mix.gain.value = def.effect === 'ring' ? 0.5 : 1;
    for (const source of sources) source.connect(mix);

    if (def.vibrato) {
      const lfo = ctx.createOscillator();
      lfo.frequency.value = def.vibrato.rate * (0.9 + rng() * 0.2);
      const depth = ctx.createGain();
      depth.gain.value = def.vibrato.depth;
      lfo.connect(depth);
      for (const source of sources) depth.connect(source.detune);
      lfo.start(t0);
      lfo.stop(end + 0.02);
    }

    // Three formants side by side, and for a nasal voice a narrow fourth
    const throat = ctx.createGain();
    for (let k = 0; k < 3; k++) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = formants[k] * def.formantScale * head.formant;
      band.Q.value = FORMANT_Q[k];
      const g = ctx.createGain();
      g.gain.value = FORMANT_GAIN[k] * 3.2;
      mix.connect(band);
      band.connect(g);
      g.connect(throat);
    }
    if (def.nasal > 0) {
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 1050;
      band.Q.value = 14;
      const g = ctx.createGain();
      g.gain.value = def.nasal * 3.2;
      mix.connect(band);
      band.connect(g);
      g.connect(throat);
    }

    // Fast attack, quick decay: a blip, not a note
    const env = ctx.createGain();
    const peak = 0.3 * def.level * head.gain * s.gain;
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(peak, t0 + 0.007);
    env.gain.exponentialRampToValueAtTime(Math.max(peak * 0.0008, 0.00005), end);
    env.gain.linearRampToValueAtTime(0, end + 0.004);
    throat.connect(env);

    let out: AudioNode = env;
    if (head.wobble > 0) {
      // Bubbling: the amplitude wobbles, each head at its own rate
      const wobble = ctx.createGain();
      wobble.gain.value = 0.6;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = head.wobble;
      const depth = ctx.createGain();
      depth.gain.value = 0.4;
      lfo.connect(depth);
      depth.connect(wobble.gain);
      lfo.start(t0);
      lfo.stop(end + 0.02);
      env.connect(wobble);
      out = wobble;
    }

    if (def.effect === 'ring') {
      // Ring modulation: the voice multiplied by a low sine, mixed with itself
      const ring = ctx.createGain();
      ring.gain.value = 0;
      const carrier = ctx.createOscillator();
      carrier.frequency.value = 62;
      carrier.connect(ring.gain);
      carrier.start(t0);
      carrier.stop(end + 0.02);
      const wetGain = ctx.createGain();
      wetGain.gain.value = 0.9;
      const dryGain = ctx.createGain();
      dryGain.gain.value = 0.6;
      out.connect(ring);
      ring.connect(wetGain);
      wetGain.connect(bus.input);
      out.connect(dryGain);
      dryGain.connect(bus.input);
    } else if (def.effect === 'mask') {
      out.connect(bus.input);
      // Breath through the mask under every syllable
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 700;
      band.Q.value = 0.6;
      const breath = ctx.createGain();
      breath.gain.setValueAtTime(0, t0);
      breath.gain.linearRampToValueAtTime(0.05 * s.gain, t0 + 0.012);
      breath.gain.exponentialRampToValueAtTime(0.0004, end);
      src.connect(band);
      band.connect(breath);
      breath.connect(bus.input);
      src.start(t0, rng());
      src.stop(end + 0.02);
    } else {
      out.connect(bus.input);
    }

    for (const source of sources) {
      source.start(t0);
      source.stop(end + 0.02);
    }
  }
}

/**
 * Schedules a whole line on a context, starting at `startAt` (the context's time, in seconds), through a compressor
 * and a soft clip into `dest`. Returns the node the line fades out of and the time the last of it is over.
 */
export function renderSpeech(
  ctx: BaseAudioContext,
  dest: AudioNode,
  def: VoiceDef,
  plan: SpeechPlan,
  startAt: number,
  volume = 1,
  rng: () => number = Math.random,
): { master: GainNode; endsAt: number } {
  const master = ctx.createGain();
  master.gain.value = volume;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -10;
  compressor.knee.value = 8;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.12;
  const clip = ctx.createWaveShaper();
  clip.curve = softClipCurve();
  clip.oversample = '2x';
  master.connect(compressor);
  compressor.connect(clip);
  clip.connect(dest);

  const bus = buildBus(ctx, def, master);
  for (const s of plan.syllables) syllableNodes(ctx, def, bus, s, startAt + s.at, rng);
  if (bus.hiss) for (const at of plan.sentenceEnds) bus.hiss(startAt + at);
  // The wet tails: a delay line rings on a little after the last syllable
  const tail = def.effect === 'choir' ? 0.6 : def.effect === 'mask' ? 0.5 : 0.1;
  return { master, endsAt: startAt + plan.duration + tail };
}

/** A line rendered to samples (mono), for checking and for files. Nothing in the game calls this. */
export async function renderSpeechOffline(id: VoiceId, text: string, sampleRate = 44100, volume = 1, rng: () => number = Math.random): Promise<Float32Array> {
  const def = VOICES[id];
  const plan = planSpeech(def, text, rng);
  const length = Math.ceil((plan.duration + 1.2) * sampleRate);
  const ctx = new OfflineAudioContext(1, length, sampleRate);
  renderSpeech(ctx, ctx.destination, def, plan, 0.05, volume, rng);
  const buffer = await ctx.startRendering();
  return buffer.getChannelData(0);
}

// ── Live voice ───────────────────────────────────────────────────────

/**
 * The voice sits under the music: the Efekty setting's level (0.8 by default) times this gives a peak near -5 dBFS
 * and a level around -28 dBFS RMS, where the music's own base volume is 0.5.
 */
const VOICE_VOLUME = 0.9;
const FADE_S = 0.03;

export interface SpeakOptions {
  /** Called as each character comes up, in step with the voice: the index in the text and the character. */
  onChar?: (index: number, char: string, voiced: boolean) => void;
  /** Called when the line is over, or cut short by stop(). */
  onEnd?: (completed: boolean) => void;
}

export interface Speech {
  /** How long the line takes to say, in milliseconds. */
  readonly durationMs: number;
  /** Cuts the line off, quickly and without a click. */
  stop(): void;
}

export class BossVoice {
  private ctx: BaseAudioContext | null;
  private dest: AudioNode | null;
  private muted: () => boolean;
  private current: { stop: () => void } | null = null;

  constructor(ctx: BaseAudioContext | null, dest: AudioNode | null, muted: () => boolean = () => false) {
    this.ctx = ctx;
    this.dest = dest;
    this.muted = muted;
  }

  /**
   * Says `text` in the boss's voice. The characters come back through onChar as they are spoken, whether or not
   * anything is audible (muted, effects at zero, the browser still locking audio), so the text always keeps pace.
   */
  speak(id: VoiceId, text: string, opts: SpeakOptions = {}): Speech {
    this.stop();
    const def = VOICES[id];
    const plan = planSpeech(def, text);
    const durationMs = Math.round(plan.duration * 1000);

    const ctx = this.ctx;
    const volume = getSfxVolume() * VOICE_VOLUME;
    let master: GainNode | null = null;
    // A context still locked would play this later, all at once, when it opens: only speak into a running one
    if (ctx && this.dest && ctx.state === 'running' && volume > 0.001 && !this.muted()) {
      master = renderSpeech(ctx, this.dest, def, plan, ctx.currentTime + 0.03, volume).master;
    } else if (ctx && 'resume' in ctx && ctx.state === 'suspended') {
      void (ctx as AudioContext).resume().catch(() => undefined);
    }

    const timers: number[] = [];
    let finished = false;
    const finish = (completed: boolean): void => {
      if (finished) return;
      finished = true;
      for (const timer of timers) window.clearTimeout(timer);
      if (master && ctx) {
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        master.gain.linearRampToValueAtTime(0, now + FADE_S);
        const node = master;
        window.setTimeout(() => node.disconnect(), FADE_S * 1000 + 60);
      }
      if (this.current === handle) this.current = null;
      opts.onEnd?.(completed);
    };
    const handle = { stop: () => finish(false) };
    this.current = handle;

    for (const ev of plan.chars) {
      timers.push(window.setTimeout(() => opts.onChar?.(ev.index, ev.char, ev.voiced), 30 + ev.at * 1000));
    }
    timers.push(window.setTimeout(() => finish(true), 30 + durationMs));

    return { durationMs, stop: handle.stop };
  }

  /** Cuts off whatever is being said. */
  stop(): void {
    this.current?.stop();
  }
}

const voices = new WeakMap<Phaser.Scene, BossVoice>();

/** The scene's voice, on Phaser's own audio context and master volume, so unlocking and muting work as for any sound. */
export function bossVoiceFor(scene: Phaser.Scene): BossVoice {
  let voice = voices.get(scene);
  if (!voice) {
    const manager = scene.sound as Partial<Phaser.Sound.WebAudioSoundManager> & Phaser.Sound.BaseSoundManager;
    const web = manager.context && manager.destination ? manager : null;
    voice = new BossVoice(web?.context ?? null, web?.destination ?? null, () => manager.mute);
    voices.set(scene, voice);
  }
  return voice;
}

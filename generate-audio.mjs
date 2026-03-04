/**
 * Generates placeholder WAV audio files for Cockroach the Game.
 * Pure Node.js — no external dependencies.
 * Each file is a short synthesized tone written as raw PCM in a WAV container.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUDIO_DIR = join(__dirname, 'public', 'audio');

// Ensure output directory exists
mkdirSync(AUDIO_DIR, { recursive: true });

const SAMPLE_RATE = 22050;
const BITS_PER_SAMPLE = 16;
const NUM_CHANNELS = 1;

/**
 * Create a WAV file buffer from an array of float samples [-1, 1].
 */
function createWav(samples) {
  const numSamples = samples.length;
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const dataSize = numSamples * NUM_CHANNELS * bytesPerSample;
  const fileSize = 44 + dataSize;

  const buffer = Buffer.alloc(fileSize);
  let offset = 0;

  // RIFF header
  buffer.write('RIFF', offset); offset += 4;
  buffer.writeUInt32LE(fileSize - 8, offset); offset += 4;
  buffer.write('WAVE', offset); offset += 4;

  // fmt sub-chunk
  buffer.write('fmt ', offset); offset += 4;
  buffer.writeUInt32LE(16, offset); offset += 4;           // sub-chunk size
  buffer.writeUInt16LE(1, offset); offset += 2;            // PCM format
  buffer.writeUInt16LE(NUM_CHANNELS, offset); offset += 2;
  buffer.writeUInt32LE(SAMPLE_RATE, offset); offset += 4;
  buffer.writeUInt32LE(SAMPLE_RATE * NUM_CHANNELS * bytesPerSample, offset); offset += 4;
  buffer.writeUInt16LE(NUM_CHANNELS * bytesPerSample, offset); offset += 2;
  buffer.writeUInt16LE(BITS_PER_SAMPLE, offset); offset += 2;

  // data sub-chunk
  buffer.write('data', offset); offset += 4;
  buffer.writeUInt32LE(dataSize, offset); offset += 4;

  // Write PCM samples
  for (let i = 0; i < numSamples; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    const intVal = Math.floor(clamped * 32767);
    buffer.writeInt16LE(intVal, offset);
    offset += 2;
  }

  return buffer;
}

/**
 * Generate a sine wave tone.
 */
function sineWave(freq, duration, volume = 0.5) {
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] = Math.sin(2 * Math.PI * freq * t) * volume;
  }
  return samples;
}

/**
 * Apply a fade-in and fade-out envelope.
 */
function applyEnvelope(samples, fadeIn = 0.01, fadeOut = 0.05) {
  const fadeInSamples = Math.floor(SAMPLE_RATE * fadeIn);
  const fadeOutSamples = Math.floor(SAMPLE_RATE * fadeOut);

  for (let i = 0; i < fadeInSamples && i < samples.length; i++) {
    samples[i] *= i / fadeInSamples;
  }
  for (let i = 0; i < fadeOutSamples && i < samples.length; i++) {
    const idx = samples.length - 1 - i;
    samples[idx] *= i / fadeOutSamples;
  }

  return samples;
}

/**
 * Mix multiple sample arrays together (summed, then clamped).
 */
function mix(...arrays) {
  const maxLen = Math.max(...arrays.map(a => a.length));
  const result = new Array(maxLen).fill(0);
  for (const arr of arrays) {
    for (let i = 0; i < arr.length; i++) {
      result[i] += arr[i];
    }
  }
  // Clamp
  for (let i = 0; i < result.length; i++) {
    result[i] = Math.max(-1, Math.min(1, result[i]));
  }
  return result;
}

/**
 * Concatenate sample arrays.
 */
function concat(...arrays) {
  return arrays.flat();
}

// ==========================================
// BGM — eerie loopable drone (2.5 seconds)
// ==========================================
function generateBGM() {
  const duration = 2.5;

  // Low drone
  const drone = sineWave(55, duration, 0.3);
  // Slightly detuned for eeriness
  const drone2 = sineWave(55.5, duration, 0.2);
  // Higher eerie tone
  const eerie = sineWave(220, duration, 0.1);
  // Pulsing mid tone
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const pulse = new Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    // Tremolo on a minor third
    pulse[i] = Math.sin(2 * Math.PI * 131 * t) * 0.15 *
               (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t));
  }

  const bgm = mix(drone, drone2, eerie, pulse);
  applyEnvelope(bgm, 0.05, 0.05);

  return createWav(bgm);
}

// ==========================================
// Jump — cartoony boing/spring (0.2s)
// Ascending sweep 200→600Hz with vibrato wobble + second harmonic
// ==========================================
function generateJump() {
  const duration = 0.2;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / duration;
    // Ascending frequency from 200 to 600 Hz over 150ms
    const sweepT = Math.min(t / 0.15, 1.0);
    const baseFreq = 200 + sweepT * 400;
    // Vibrato wobble — 30Hz modulation, +/- 20Hz
    const vibrato = 20 * Math.sin(2 * Math.PI * 30 * t);
    const freq = baseFreq + vibrato;
    // Fundamental
    const fundamental = Math.sin(2 * Math.PI * freq * t) * 0.45;
    // Second harmonic for richness
    const harmonic = Math.sin(2 * Math.PI * freq * 2 * t) * 0.15;
    // Quick amplitude envelope — punchy attack, smooth decay
    const amp = Math.exp(-progress * 3) * (1 - Math.exp(-t * 200));
    samples[i] = (fundamental + harmonic) * amp;
  }

  applyEnvelope(samples, 0.002, 0.03);
  return createWav(samples);
}

// ==========================================
// Apple — BITE CRUNCH sound (0.25s)
// Layered noise bursts simulating teeth crunching through apple
// ==========================================
function generateApple() {
  const duration = 0.25;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Array(numSamples).fill(0);

  // Helper: band-passed noise burst
  function noiseBurst(startTime, burstDuration, lowFreq, highFreq, volume) {
    const startSample = Math.floor(startTime * SAMPLE_RATE);
    const burstSamples = Math.floor(burstDuration * SAMPLE_RATE);
    // Simple band-pass via mixing filtered noise
    let prev = 0;
    let prev2 = 0;
    const cutoffHigh = highFreq / SAMPLE_RATE;
    const cutoffLow = lowFreq / SAMPLE_RATE;
    for (let i = 0; i < burstSamples; i++) {
      const idx = startSample + i;
      if (idx >= numSamples) break;
      const t = i / SAMPLE_RATE;
      // Raw noise
      let noise = Math.random() * 2 - 1;
      // Simple high-pass (remove low frequencies)
      const alphaHP = 1 - cutoffLow * 2 * Math.PI * 0.01;
      noise = alphaHP * (prev + noise - prev2);
      prev2 = prev + noise - prev2;
      prev = noise;
      // Low-pass to cut harsh highs
      const alphaLP = cutoffHigh * 2 * Math.PI * 0.02;
      noise = noise * Math.min(alphaLP, 1);
      // Sharp attack, quick decay envelope
      const env = Math.exp(-t * 40) * (1 - Math.exp(-t * 2000));
      samples[idx] += noise * volume * env;
    }
  }

  // Crunch layer 1: Sharp initial bite — high frequency crack (0-30ms)
  noiseBurst(0.0, 0.035, 2000, 8000, 0.8);

  // Crunch layer 2: Mid crunch — apple flesh breaking (15-65ms)
  noiseBurst(0.015, 0.055, 800, 4000, 0.65);

  // Crunch layer 3: Low crunch body — satisfying depth (10-70ms)
  noiseBurst(0.010, 0.065, 300, 2000, 0.5);

  // Tiny pop/click at the very start (teeth impact)
  const clickSamples = Math.floor(0.003 * SAMPLE_RATE);
  for (let i = 0; i < clickSamples && i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    samples[i] += Math.sin(2 * Math.PI * 1500 * t) * 0.4 * Math.exp(-t * 1500);
  }

  // Brief satisfying "pop" resonance after crunch (80-120ms)
  const popStart = Math.floor(0.08 * SAMPLE_RATE);
  const popDuration = Math.floor(0.04 * SAMPLE_RATE);
  for (let i = 0; i < popDuration; i++) {
    const idx = popStart + i;
    if (idx >= numSamples) break;
    const t = i / SAMPLE_RATE;
    samples[idx] += Math.sin(2 * Math.PI * 600 * t) * 0.2 * Math.exp(-t * 80);
  }

  // Normalize
  let maxVal = 0;
  for (let i = 0; i < numSamples; i++) {
    maxVal = Math.max(maxVal, Math.abs(samples[i]));
  }
  if (maxVal > 0) {
    const scale = 0.85 / maxVal;
    for (let i = 0; i < numSamples; i++) {
      samples[i] *= scale;
    }
  }

  applyEnvelope(samples, 0.001, 0.04);
  return createWav(samples);
}

// ==========================================
// Death — dramatic splat/crunch (0.5s)
// Noise burst + descending tone + bass thump
// ==========================================
function generateDeath() {
  const duration = 0.5;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Array(numSamples).fill(0);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / duration;

    // Bass thump at the start (60Hz, fast decay)
    const thump = Math.sin(2 * Math.PI * 60 * t) * 0.6 * Math.exp(-t * 15);

    // Noise burst — initial splat/crunch (first 50ms)
    let noiseBurst = 0;
    if (t < 0.06) {
      noiseBurst = (Math.random() * 2 - 1) * 0.7 * Math.exp(-t * 30);
    }

    // Descending tone from 800Hz to 100Hz over 400ms with grit
    const descFreq = 800 - Math.min(progress / 0.8, 1) * 700;
    const descTone = Math.sin(2 * Math.PI * descFreq * t) * 0.35 * Math.exp(-t * 4);
    // Add gritty harmonics
    const grit = Math.sin(2 * Math.PI * descFreq * 3 * t) * 0.1 * Math.exp(-t * 6);

    // Crackle/crunch noise layer (decaying over 200ms)
    let crackle = 0;
    if (t < 0.2) {
      crackle = (Math.random() * 2 - 1) * 0.25 * Math.exp(-t * 15);
    }

    samples[i] = thump + noiseBurst + descTone + grit + crackle;
  }

  // Normalize
  let maxVal = 0;
  for (let i = 0; i < numSamples; i++) {
    maxVal = Math.max(maxVal, Math.abs(samples[i]));
  }
  if (maxVal > 0) {
    const scale = 0.9 / maxVal;
    for (let i = 0; i < numSamples; i++) {
      samples[i] *= scale;
    }
  }

  applyEnvelope(samples, 0.002, 0.1);
  return createWav(samples);
}

// ==========================================
// Floor switch — quick swoosh/whoosh (0.12s)
// Filtered noise sweep from high to low frequency
// ==========================================
function generateFloorSwitch() {
  const duration = 0.12;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Array(numSamples);

  // Simple one-pole low-pass filter state
  let filteredNoise = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / duration;

    // Sweep cutoff from high to low
    const cutoff = 6000 - progress * 5500;
    const rc = 1.0 / (2 * Math.PI * cutoff);
    const dt = 1.0 / SAMPLE_RATE;
    const alpha = dt / (rc + dt);

    // Generate noise and filter it
    const noise = (Math.random() * 2 - 1);
    filteredNoise += alpha * (noise - filteredNoise);

    // Add a subtle sine undertone for body
    const swooshTone = Math.sin(2 * Math.PI * (400 - progress * 300) * t) * 0.15;

    // Envelope: quick attack, smooth decay
    const env = Math.exp(-progress * 4) * (1 - Math.exp(-t * 1000));

    samples[i] = (filteredNoise * 0.7 + swooshTone) * env;
  }

  applyEnvelope(samples, 0.001, 0.02);
  return createWav(samples);
}

// ==========================================
// Menu BGM — dreamy eerie ambient loop (8s)
// ==========================================
function generateMenuBGM() {
  const duration = 8.0;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;

    // Low frequency drone (70 Hz + slight detune)
    const drone1 = Math.sin(2 * Math.PI * 70 * t) * 0.15;
    const drone2 = Math.sin(2 * Math.PI * 70.3 * t) * 0.1;

    // Higher ethereal tone with slow modulation (350 Hz warbled)
    const modFreq = 350 + 15 * Math.sin(2 * Math.PI * 0.3 * t);
    const ethereal = Math.sin(2 * Math.PI * modFreq * t) * 0.06 *
                     (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.5 * t));

    // Very high shimmer (700 Hz, barely audible, wobbling)
    const shimmer = Math.sin(2 * Math.PI * (700 + 20 * Math.sin(2 * Math.PI * 0.7 * t)) * t) * 0.03;

    // Sub-bass pulse
    const subPulse = Math.sin(2 * Math.PI * 35 * t) * 0.08 *
                     (0.5 + 0.5 * Math.sin(2 * Math.PI * 0.25 * t));

    samples[i] = drone1 + drone2 + ethereal + shimmer + subPulse;
  }

  // Crossfade for seamless loop (0.5s)
  const crossfadeSamples = Math.floor(SAMPLE_RATE * 0.5);
  for (let i = 0; i < crossfadeSamples; i++) {
    const fade = i / crossfadeSamples;
    const endIdx = numSamples - crossfadeSamples + i;
    samples[endIdx] = samples[endIdx] * (1 - fade) + samples[i] * fade;
  }

  return createWav(samples);
}

// ==========================================
// Game Over BGM — sad descending ambient (6s)
// ==========================================
function generateGameOverBGM() {
  const duration = 6.0;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / duration;

    // Low ominous drone (60 Hz)
    const drone = Math.sin(2 * Math.PI * 60 * t) * 0.18;
    const drone2 = Math.sin(2 * Math.PI * 60.4 * t) * 0.12;

    // Descending tone from 400Hz to 200Hz
    const descFreq = 400 - progress * 200;
    const descending = Math.sin(2 * Math.PI * descFreq * t) * 0.08;

    // Descending minor third harmony
    const harmFreq = descFreq * 1.2 - progress * 50;
    const harmony = Math.sin(2 * Math.PI * harmFreq * t) * 0.04;

    // Slow tremolo on everything
    const tremolo = 0.7 + 0.3 * Math.sin(2 * Math.PI * 1.5 * t);

    samples[i] = (drone + drone2 + descending + harmony) * tremolo;
  }

  // Crossfade for seamless loop (0.3s)
  const crossfadeSamples = Math.floor(SAMPLE_RATE * 0.3);
  for (let i = 0; i < crossfadeSamples; i++) {
    const fade = i / crossfadeSamples;
    const endIdx = numSamples - crossfadeSamples + i;
    samples[endIdx] = samples[endIdx] * (1 - fade) + samples[i] * fade;
  }

  return createWav(samples);
}

// ==========================================
// Dash — speed boost whoosh (0.25s)
// Ascending noise sweep with sine undertone, dramatic
// ==========================================
function generateDash() {
  const duration = 0.25;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Array(numSamples);

  // Low-pass filter state
  let filteredNoise = 0;

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    const progress = t / duration;

    // Ascending cutoff sweep (low to high) — speed boost feel
    const cutoff = 500 + progress * 5500;
    const rc = 1.0 / (2 * Math.PI * cutoff);
    const dt = 1.0 / SAMPLE_RATE;
    const alpha = dt / (rc + dt);

    // Filtered noise
    const noise = (Math.random() * 2 - 1);
    filteredNoise += alpha * (noise - filteredNoise);

    // Ascending sine undertone for power feel
    const sineFreq = 150 + progress * 400;
    const sineTone = Math.sin(2 * Math.PI * sineFreq * t) * 0.25;

    // Second harmonic for richness
    const harmonic = Math.sin(2 * Math.PI * sineFreq * 2 * t) * 0.08;

    // Envelope: builds up then cuts off
    const env = Math.sin(progress * Math.PI) * (1 - Math.pow(progress, 3) * 0.5);

    samples[i] = (filteredNoise * 0.55 + sineTone + harmonic) * env;
  }

  applyEnvelope(samples, 0.005, 0.03);
  return createWav(samples);
}

// ==========================================
// Write all files
// ==========================================

const files = [
  { name: 'bgm.wav', generator: generateBGM },
  { name: 'jump.wav', generator: generateJump },
  { name: 'apple.wav', generator: generateApple },
  { name: 'death.wav', generator: generateDeath },
  { name: 'floor-switch.wav', generator: generateFloorSwitch },
  { name: 'dash.wav', generator: generateDash },
  { name: 'menu-bgm.wav', generator: generateMenuBGM },
  { name: 'gameover-bgm.wav', generator: generateGameOverBGM },
];

for (const { name, generator } of files) {
  const path = join(AUDIO_DIR, name);
  const wav = generator();
  writeFileSync(path, wav);
  console.log(`Generated: ${path} (${wav.length} bytes)`);
}

console.log('\nAll audio files generated successfully.');

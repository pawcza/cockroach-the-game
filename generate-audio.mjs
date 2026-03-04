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
// Jump — quick ascending tone (0.2s)
// ==========================================
function generateJump() {
  const duration = 0.2;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    // Ascending frequency from 200 to 800 Hz
    const freq = 200 + (t / duration) * 600;
    samples[i] = Math.sin(2 * Math.PI * freq * t) * 0.5;
  }

  applyEnvelope(samples, 0.005, 0.05);
  return createWav(samples);
}

// ==========================================
// Apple — sparkle chime, two quick high notes (0.4s)
// ==========================================
function generateApple() {
  // First note: E6 (1318 Hz) for 0.15s
  const note1 = sineWave(1318, 0.15, 0.4);
  // Add harmonics for sparkle
  const harm1 = sineWave(2636, 0.15, 0.15);

  // Brief gap
  const gap = new Array(Math.floor(SAMPLE_RATE * 0.05)).fill(0);

  // Second note: G6 (1568 Hz) for 0.2s
  const note2 = sineWave(1568, 0.2, 0.4);
  const harm2 = sineWave(3136, 0.2, 0.15);

  const first = mix(note1, harm1);
  const second = mix(note2, harm2);

  applyEnvelope(first, 0.005, 0.03);
  applyEnvelope(second, 0.005, 0.06);

  const result = concat(first, gap, second);
  return createWav(result);
}

// ==========================================
// Death — descending dramatic tone (0.8s)
// ==========================================
function generateDeath() {
  const duration = 0.8;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    // Descending from 400 to 60 Hz
    const freq = 400 - (t / duration) * 340;
    // Add some grit with a square-ish wave
    const sine = Math.sin(2 * Math.PI * freq * t);
    const square = Math.sign(Math.sin(2 * Math.PI * freq * 0.5 * t));
    samples[i] = (sine * 0.4 + square * 0.15);
  }

  applyEnvelope(samples, 0.01, 0.2);
  return createWav(samples);
}

// ==========================================
// Floor switch — short thud/click (0.15s)
// ==========================================
function generateFloorSwitch() {
  const duration = 0.15;
  const numSamples = Math.floor(SAMPLE_RATE * duration);
  const samples = new Array(numSamples);

  for (let i = 0; i < numSamples; i++) {
    const t = i / SAMPLE_RATE;
    // Low thud — quick frequency drop with noise
    const freq = 150 - (t / duration) * 120;
    const tone = Math.sin(2 * Math.PI * freq * t) * 0.5;
    const noise = (Math.random() * 2 - 1) * 0.1 * Math.exp(-t * 30);
    samples[i] = tone + noise;
  }

  applyEnvelope(samples, 0.002, 0.05);
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
];

for (const { name, generator } of files) {
  const path = join(AUDIO_DIR, name);
  const wav = generator();
  writeFileSync(path, wav);
  console.log(`Generated: ${path} (${wav.length} bytes)`);
}

console.log('\nAll audio files generated successfully.');

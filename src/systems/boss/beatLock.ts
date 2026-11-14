/**
 * DJ Bigos's fight on his track's beat. His track (public/boss/bigos-bgm.ogg) is 120 BPM, 16 bars of 4 beats (32 s),
 * its first downbeat on sample 0, so it lines up with the fight when a bar of the fight's clock (a multiple of BAR_MS)
 * falls on a bar of the track.
 *
 * The fight's clock leads, and the music is left alone: the clock stands still on a hit, the pause lets it on by at
 * most a frame's cap, a hitch moves it only so far, while the track plays on. So every frame the fight reads where the
 * track is and, when the two have come apart, runs its clock a little fast or slow (never backwards, never past the
 * frame cap) until they meet again. Only when they are further apart than a nudge should cover (the audio unlocked
 * late, a long hitch) is the track moved onto the fight's bars instead. Pure, so the maths is tested without Phaser.
 */
import { BEAT_MS } from './bigosPatterns';

export const BAR_MS = 4 * BEAT_MS;
/** Closer than this they count as together: the audio clock's own jitter is left alone. */
export const LOCK_TOLERANCE_MS = 8;
/** The most a frame's step is lengthened or shortened by, as a share of it. */
export const LOCK_SLEW = 0.25;
/** Further apart than this, the track is moved rather than the fight nudged. */
export const LOCK_SEEK_MS = 400;
/** On the fight's first beat, a track further off than this is moved onto it (it has only just started). */
export const LOCK_START_MS = 30;

/** How far the track is ahead of the fight's clock, ms, to the nearest bar: in [-BAR_MS / 2, BAR_MS / 2). */
export function barDrift(clockMs: number, trackMs: number): number {
  const d = (trackMs - clockMs) % BAR_MS;
  return ((d + BAR_MS * 1.5) % BAR_MS) - BAR_MS / 2;
}

/** Where to move the track so its bars fall on the fight's: the nearest such spot, never before the file's start. */
export function alignedTrackMs(clockMs: number, trackMs: number): number {
  const to = trackMs - barDrift(clockMs, trackMs);
  return to < 0 ? to + BAR_MS : to;
}

/** A frame's move of the fight's clock (`step` past `clockMs`), and where to move the track to, if anywhere. */
export interface BeatLock {
  step: number;
  seekTo: number | null;
}

/** The frame's step locked to the track heard at `trackMs`; with no track (not loaded, audio locked) the step as it is. */
export function lockStep(clockMs: number, step: number, trackMs: number | null, maxStep: number): BeatLock {
  if (trackMs === null) return { step, seekTo: null };
  const drift = barDrift(clockMs + step, trackMs);
  if (Math.abs(drift) > LOCK_SEEK_MS) return { step, seekTo: alignedTrackMs(clockMs + step, trackMs) };
  if (Math.abs(drift) <= LOCK_TOLERANCE_MS) return { step, seekTo: null };
  const nudge = Math.sign(drift) * Math.min(Math.abs(drift), step * LOCK_SLEW);
  return { step: Math.min(maxStep, step + nudge), seekTo: null };
}

/** On the first beat: where to move a track that is off the fight's bars, or null when it is on them (or absent). */
export function startSeek(clockMs: number, trackMs: number | null): number | null {
  if (trackMs === null || Math.abs(barDrift(clockMs, trackMs)) <= LOCK_START_MS) return null;
  return alignedTrackMs(clockMs, trackMs);
}

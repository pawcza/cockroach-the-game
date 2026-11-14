/**
 * DJ Bigos's fight on his track's beat (beatLock.ts): the fight's clock is nudged onto the track's bars every frame,
 * after whatever came between them (a hit-stop, the pause, a hitch), and runs exactly as it did without the track.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { alignedTrackMs, BAR_MS, barDrift, LOCK_START_MS, LOCK_TOLERANCE_MS, lockStep, startSeek } from '../src/systems/boss/beatLock';
import { BEAT_MS } from '../src/systems/boss/bigosPatterns';
import { HOLD_FADE_MS } from '../src/audio/MusicDeck';

/** His track: 16 bars at 120 BPM. */
const TRACK_MS = 32000;
/** BigosFight's cap on one frame's move of its clock. */
const MAX_STEP_MS = 250;
const FRAME = 1000 / 60;

/** The fight's clock and the track, frame by frame, as BigosFight.update drives them. */
class Sim {
  clock = 0;
  /** ms into the track (wrapped when read), or null with no track playing. */
  track: number | null;
  steps: number[] = [];

  constructor(track: number | null = 0) {
    this.track = track;
  }

  /** One frame: `fight` ms of scene time (capped as the fight caps it), `track` ms of audio; frozen = a hit-stop. */
  frame({ fight = FRAME, track = FRAME, frozen = false } = {}): void {
    if (this.track !== null) this.track += track;
    if (frozen) return;
    const lock = lockStep(this.clock, Math.min(MAX_STEP_MS, fight), this.heard, MAX_STEP_MS);
    if (lock.seekTo !== null) this.track = lock.seekTo;
    this.steps.push(lock.step);
    this.clock += lock.step;
  }

  frames(n: number, opts: Parameters<Sim['frame']>[0] = {}): void {
    for (let i = 0; i < n; i++) this.frame(opts);
  }

  get heard(): number | null { return this.track === null ? null : this.track % TRACK_MS; }
  get drift(): number { return barDrift(this.clock, this.heard!); }

  /** Frames until the two are together again (within the tolerance), up to `max`. */
  settle(max = 600): number {
    for (let i = 0; i < max; i++) {
      if (Math.abs(this.drift) <= LOCK_TOLERANCE_MS) return i;
      this.frame();
    }
    return Infinity;
  }
}

test('the drift is folded to the nearest bar, so a whole bar or a whole loop of the track is no drift', () => {
  assert.equal(barDrift(0, 0), 0);
  assert.equal(barDrift(0, BAR_MS), 0);
  assert.equal(barDrift(1500, 1500 + TRACK_MS), 0);
  assert.equal(barDrift(1000, 1010), 10);
  assert.equal(barDrift(1000, 990), -10);
  assert.equal(barDrift(0, BAR_MS - 1), -1);
  for (let t = 0; t < 3 * BAR_MS; t += 37) {
    const d = barDrift(t * 1.7, t);
    assert.ok(d >= -BAR_MS / 2 && d < BAR_MS / 2, `${d}`);
  }
});

test('the aligned spot puts the track on the fight\'s bar, and never before the start of the file', () => {
  for (const [clock, track] of [[0, 0], [1500, 0], [1250, 40], [7000, 31990], [500, 1900]]) {
    const to = alignedTrackMs(clock, track);
    assert.ok(to >= 0, `${to}`);
    assert.ok(Math.abs(barDrift(clock, to)) < 1e-9, `${clock} ${track} -> ${to}`);
    assert.ok(Math.abs(to - track) <= BAR_MS, `${to} is more than a bar from ${track}`);
  }
});

test('with no track playing the fight\'s clock runs exactly as it did on its own', () => {
  const sim = new Sim(null);
  sim.frames(10);
  sim.frame({ fight: 400 });
  sim.frames(10);
  const expected = [...Array(10).fill(FRAME), MAX_STEP_MS, ...Array(10).fill(FRAME)];
  assert.deepEqual(sim.steps, expected);
  assert.equal(startSeek(1500, null), null);
});

test('a nudge never runs the clock backwards, past the frame cap, or past the track', () => {
  for (const drift of [-900, -300, -40, -9, 9, 40, 300]) {
    for (const step of [0, 4, FRAME, 100, MAX_STEP_MS]) {
      const clock = 10000;
      const lock = lockStep(clock, step, clock + step + drift, MAX_STEP_MS);
      if (lock.seekTo !== null) continue;
      assert.ok(lock.step >= 0, `${lock.step}`);
      assert.ok(lock.step <= MAX_STEP_MS, `${lock.step}`);
      // It closes the gap without overshooting it
      assert.ok(Math.abs(drift - (lock.step - step)) <= Math.abs(drift), `${drift} ${step} ${lock.step}`);
    }
  }
});

test('from the fight\'s first beat: the track started at the wipe, the clock a frame later, together by the first beat', () => {
  // The wipe starts the track; the fight is made the same frame and its clock counts from its first update
  const sim = new Sim(0);
  sim.frame({ fight: 0 });
  // The brake, then the first beat after it (the fight's own rule: the beat after it has stopped)
  const firstBeat = (Math.ceil(800 / BEAT_MS) + 1) * BEAT_MS;
  while (sim.clock < firstBeat) sim.frame();
  assert.ok(Math.abs(sim.drift) <= LOCK_TOLERANCE_MS, `${sim.drift} ms off on the first beat`);
  assert.equal(startSeek(sim.clock, sim.heard), null, 'nothing to move on the first beat');
});

test('a track that only starts on the first beat (no pre-battle loop) is moved onto the fight\'s bar', () => {
  const clock = 3 * BEAT_MS;
  const to = startSeek(clock, 0);
  assert.notEqual(to, null);
  assert.ok(Math.abs(barDrift(clock, to!)) < 1e-9);
  assert.equal(startSeek(clock, clock + LOCK_START_MS - 1), null, 'close enough is left alone');
});

test('after a hit-stop the clock catches the track up within a few frames', () => {
  const sim = new Sim(0);
  sim.frames(120);
  assert.ok(Math.abs(sim.drift) <= LOCK_TOLERANCE_MS);
  // A parry: the fight holds 110 ms while the track plays on
  sim.frames(Math.round(110 / FRAME), { frozen: true });
  assert.ok(sim.drift > 100, `${sim.drift}`);
  const frames = sim.settle();
  assert.ok(frames * FRAME < 600, `${frames} frames to catch up`);
  // A wreck holds the longest (280 ms)
  sim.frames(Math.round(280 / FRAME), { frozen: true });
  assert.ok(sim.settle() * FRAME < 1300);
});

test('after the pause: the clock gets the frame cap, the track only its hold fade, and they meet again', () => {
  const sim = new Sim(0);
  sim.frames(300);
  // The hold fades the music out (it plays on for that), then holds it; the fight's first frame back is capped
  sim.track! += HOLD_FADE_MS;
  sim.frame({ fight: 5000 });
  assert.ok(Math.abs(sim.drift) <= 40, `${sim.drift} ms apart after the pause`);
  assert.ok(sim.settle() * FRAME < 300);
  // A short pause, released before the hold fade was done: nothing came between them
  sim.frame({ fight: 150, track: 150 });
  assert.ok(Math.abs(sim.drift) <= LOCK_TOLERANCE_MS);
});

test('after a hitch the frame cap holds, and the clock makes the rest up over the next frames', () => {
  const sim = new Sim(0);
  sim.frames(300);
  sim.frame({ fight: 400, track: 400 });
  assert.equal(sim.steps[sim.steps.length - 1], MAX_STEP_MS, 'the hitch still moves the clock by the cap only');
  assert.ok(sim.settle() * FRAME < 1000);
  assert.ok(sim.steps.every(s => s <= MAX_STEP_MS));
});

test('far apart (the audio unlocked late): the track is moved, the fight is not rushed', () => {
  const sim = new Sim(null);
  sim.frames(200);
  sim.track = 0;
  sim.frame();
  assert.ok(Math.abs(sim.drift) <= LOCK_TOLERANCE_MS, `${sim.drift}`);
  assert.equal(sim.steps[sim.steps.length - 1], FRAME);
});

test('across the track\'s loop the two stay together for minutes', () => {
  const sim = new Sim(0);
  sim.frame({ fight: 0 });
  let worst = 0;
  for (let i = 0; i < 60 * 150; i++) {
    sim.frame();
    if (i > 60) worst = Math.max(worst, Math.abs(sim.drift));
  }
  assert.ok(worst <= LOCK_TOLERANCE_MS, `${worst}`);
});

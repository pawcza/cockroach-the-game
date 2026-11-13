/**
 * The run's music (MusicDeck): exactly one track is left once the fades are done, however quickly the music changes,
 * and stopping it ends every track it started. After a boss the music changes twice a frame apart (back to the level
 * the fight was fought in, then to the level that arrives as the reward): that used to leave the boss's music looping
 * for good, on into the game over and the next run.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MUSIC_LEVEL, MusicDeck, MusicPorts } from '../src/audio/MusicDeck';

interface Track { key: string; level: number; ended: boolean }
interface Fade { from: number; to: number; t: number; onUpdate: (level: number) => void; onDone: () => void; stopped: boolean; done: boolean }

/** Sound and fades as plain records; a fade moves only when the test steps it, and stop() skips onDone as Phaser's does. */
function rig() {
  const tracks: Track[] = [];
  const fades: Fade[] = [];
  const ports: MusicPorts<Track> = {
    play: (key, level) => { const t = { key, level, ended: false }; tracks.push(t); return t; },
    setLevel: (t, level) => {
      assert.equal(t.ended, false, `${t.key} set after it ended`);
      t.level = level;
    },
    end: (t) => {
      assert.equal(t.ended, false, `${t.key} ended twice`);
      t.ended = true;
    },
    fade: (from, to, onUpdate, onDone) => {
      const f: Fade = { from, to, t: 0, onUpdate, onDone, stopped: false, done: false };
      fades.push(f);
      return { stop: () => { f.stopped = true; } };
    },
  };
  const live = (): Fade[] => fades.filter(f => !f.stopped && !f.done);
  /** Every running fade moves this share of the way (a frame is a small share). */
  const step = (share: number): void => {
    for (const f of live()) {
      f.t = Math.min(1, f.t + share);
      f.onUpdate(f.from + (f.to - f.from) * f.t);
      if (f.t >= 1) { f.done = true; f.onDone(); }
    }
  };
  const settle = (): void => { while (live().length > 0) step(0.25); };
  const sounding = (): string[] => tracks.filter(t => !t.ended).map(t => t.key);
  return { deck: new MusicDeck(ports), tracks, step, settle, sounding };
}

test('a plain change fades the old track out and ends it', () => {
  const { deck, step, settle, sounding, tracks } = rig();
  deck.start('bgm-lv1');
  deck.switchTo('boss-bgm');
  step(0.5);
  assert.deepEqual(sounding(), ['bgm-lv1', 'boss-bgm']);
  settle();
  assert.deepEqual(sounding(), ['boss-bgm']);
  assert.equal(tracks.find(t => t.key === 'boss-bgm')!.level, MUSIC_LEVEL);
  assert.equal(deck.key, 'boss-bgm');
});

test('after a boss: two changes a frame apart leave only the new level\'s music', () => {
  const { deck, step, settle, sounding, tracks } = rig();
  deck.start('bgm-lv2');
  deck.switchTo('boss-bgm');
  settle();
  // The boss falls: back to the level of the fight, and next frame the level that waited on her
  deck.switchTo('bgm-lv2');
  step(0.02);
  deck.switchTo('bgm-lv3');
  settle();
  assert.deepEqual(sounding(), ['bgm-lv3']);
  assert.equal(tracks.find(t => t.key === 'bgm-lv3')!.level, MUSIC_LEVEL);
  assert.equal(deck.current, tracks.find(t => t.key === 'bgm-lv3'));
});

test('a track cut off while fading in fades out from where it got, not from full', () => {
  const { deck, step, tracks } = rig();
  deck.start('boss-bgm');
  deck.switchTo('bgm-lv2');
  step(0.2);
  const lv2 = tracks.find(t => t.key === 'bgm-lv2')!;
  const reached = lv2.level;
  deck.switchTo('bgm-lv3');
  step(0.01);
  assert.ok(lv2.level <= reached, `${lv2.level} > ${reached}`);
});

test('many changes in a row still settle on one track', () => {
  const { deck, step, settle, sounding } = rig();
  deck.start('bgm-lv1');
  for (const key of ['boss-bgm', 'bgm-lv1', 'bgm-lv2', 'boss-bgm', 'bgm-lv3']) { deck.switchTo(key); step(0.1); }
  settle();
  assert.deepEqual(sounding(), ['bgm-lv3']);
});

test('stop in the middle of a crossfade (a death, Od nowa, the menu) ends every track at once', () => {
  const { deck, step, settle, sounding } = rig();
  deck.start('bgm-lv2');
  deck.switchTo('boss-bgm');
  step(0.1);
  deck.switchTo('bgm-lv2');
  step(0.1);
  deck.stop();
  assert.deepEqual(sounding(), []);
  // A fade left behind must not touch a track that has ended (setLevel asserts it)
  settle();
  assert.equal(deck.key, '');
  assert.equal(deck.current, null);
});

test('start ends whatever was still playing or fading', () => {
  const { deck, step, sounding } = rig();
  deck.start('bgm-lv1');
  deck.switchTo('boss-bgm');
  step(0.1);
  deck.start('bgm-lv1');
  assert.deepEqual(sounding(), ['bgm-lv1']);
});

test('the same track again changes nothing', () => {
  const { deck, tracks } = rig();
  deck.start('boss-bgm');
  deck.switchTo('boss-bgm');
  assert.equal(tracks.length, 1);
});

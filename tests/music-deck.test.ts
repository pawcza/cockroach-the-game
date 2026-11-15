/**
 * The run's music (MusicDeck): exactly one track is left once the fades are done, however quickly the music changes,
 * and stopping it ends every track it started. After a boss the music changes twice a frame apart (back to the level
 * the fight was fought in, then to the level that arrives as the reward): that used to leave the boss's music looping
 * for good, on into the game over and the next run. Tracks load as the run goes (src/config/packs.ts): one asked for
 * before its file is in comes in as it lands, if its moment is still on, and the track of a moment that is over never
 * plays on in the meantime.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { MUSIC_LEVEL, MusicDeck, MusicPorts } from '../src/audio/MusicDeck';
import { BOSSES } from '../src/systems/boss/bosses';

interface Track { key: string; level: number; ended: boolean; paused: boolean }
interface Fade { from: number; to: number; t: number; onUpdate: (level: number) => void; onDone: () => void; stopped: boolean; done: boolean; scene: boolean }

/** Sound and fades as plain records; a fade moves only when the test steps it, and stop() skips onDone as Phaser's does. */
function rig(missing: string[] = []) {
  const notIn = new Set(missing);
  const tracks: Track[] = [];
  const fades: Fade[] = [];
  const ports: MusicPorts<Track> = {
    play: (key, level) => { const t = { key, level, ended: false, paused: false }; tracks.push(t); return t; },
    setLevel: (t, level) => {
      assert.equal(t.ended, false, `${t.key} set after it ended`);
      t.level = level;
    },
    end: (t) => {
      assert.equal(t.ended, false, `${t.key} ended twice`);
      t.ended = true;
    },
    has: (key) => !notIn.has(key),
    fade: (from, to, onUpdate, onDone) => {
      const f: Fade = { from, to, t: 0, onUpdate, onDone, stopped: false, done: false, scene: true };
      fades.push(f);
      return { stop: () => { f.stopped = true; } };
    },
    // The hold's fades are clock-free in the game; here they step with the rest
    ramp: (from, to, _ms, onUpdate, onDone) => {
      const f: Fade = { from, to, t: 0, onUpdate, onDone, stopped: false, done: false, scene: false };
      fades.push(f);
      return { stop: () => { f.stopped = true; } };
    },
    pause: (t) => { assert.equal(t.ended, false, `${t.key} paused after it ended`); t.paused = true; },
    resume: (t) => { assert.equal(t.ended, false, `${t.key} resumed after it ended`); t.paused = false; },
  };
  /** While paused the scene's tweens stand still: only the hold's own fades move. */
  let paused = false;
  const live = (): Fade[] => fades.filter(f => !f.stopped && !f.done && !(paused && f.scene));
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
  const deck = new MusicDeck(ports);
  /** A track's file lands, as the audio cache tells AudioManager. */
  const arrive = (key: string): void => { notIn.delete(key); deck.arrived(key); };
  return { deck, tracks, step, settle, sounding, arrive, setPaused: (p: boolean) => { paused = p; } };
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

test('hold fades the music out and holds every track; release goes on from the same tracks', () => {
  const { deck, step, settle, sounding, tracks, setPaused } = rig();
  deck.start('bgm-lv2');
  setPaused(true);
  deck.hold();
  step(0.5);
  assert.equal(tracks[0].paused, false, 'not held until the fade is done');
  settle();
  assert.equal(tracks[0].paused, true);
  assert.equal(tracks[0].level, 0);
  assert.deepEqual(sounding(), ['bgm-lv2']);
  setPaused(false);
  deck.release();
  assert.equal(tracks[0].paused, false);
  settle();
  assert.equal(tracks.length, 1, 'the same track continues, none started anew');
  assert.equal(tracks[0].level, MUSIC_LEVEL);
});

test('hold in the middle of a crossfade holds both tracks and release finishes the crossfade', () => {
  const { deck, step, settle, sounding, tracks, setPaused } = rig();
  deck.start('bgm-lv2');
  deck.switchTo('boss-bgm');
  step(0.3);
  setPaused(true);
  deck.hold();
  settle();
  assert.ok(tracks.every(t => t.paused));
  setPaused(false);
  deck.release();
  settle();
  assert.deepEqual(sounding(), ['boss-bgm']);
});

test('a quick release before the hold has finished fading leaves nothing paused', () => {
  const { deck, step, settle, tracks } = rig();
  deck.start('bgm-lv1');
  deck.hold();
  step(0.3);
  deck.release();
  settle();
  assert.equal(tracks[0].paused, false);
  assert.equal(tracks[0].level, MUSIC_LEVEL);
});

test('a change while held swaps the tracks outright and the new one waits to be released', () => {
  const { deck, settle, sounding, tracks } = rig();
  deck.start('bgm-lv1');
  deck.hold();
  settle();
  deck.switchTo('boss-bgm');
  assert.deepEqual(sounding(), ['boss-bgm']);
  assert.equal(tracks.find(t => t.key === 'boss-bgm')!.paused, true);
  deck.release();
  settle();
  assert.deepEqual(sounding(), ['boss-bgm']);
  assert.equal(tracks.find(t => t.key === 'boss-bgm')!.paused, false);
  assert.equal(tracks.find(t => t.key === 'boss-bgm')!.level, MUSIC_LEVEL);
});

test('stop while held (the scene shuts down on the pause menu) ends every track', () => {
  const { deck, step, settle, sounding } = rig();
  deck.start('bgm-lv2');
  deck.switchTo('boss-bgm');
  step(0.2);
  deck.hold();
  settle();
  deck.stop();
  assert.deepEqual(sounding(), []);
  assert.equal(deck.isHeld, false);
  settle();
});

test('stop in the middle of the hold fade ends every track and leaves no fade touching them', () => {
  const { deck, step, settle, sounding } = rig();
  deck.start('bgm-lv2');
  deck.hold();
  step(0.4);
  deck.stop();
  assert.deepEqual(sounding(), []);
  settle();
});

test('the boss screens: level, pre-battle loop, boss music, his death, the ability screen, the level again', () => {
  const { deck, step, settle, sounding } = rig();
  deck.start('bgm-lv2');
  deck.switchTo('boss-prelude');
  settle();
  assert.deepEqual(sounding(), ['boss-prelude']);
  deck.switchTo('boss-bgm');
  step(0.3);
  assert.deepEqual(sounding(), ['boss-prelude', 'boss-bgm']);
  settle();
  assert.deepEqual(sounding(), ['boss-bgm']);
  deck.fadeOut(350);
  assert.equal(deck.key, '');
  step(0.5);
  deck.switchTo('boss-aftermath');
  settle();
  assert.deepEqual(sounding(), ['boss-aftermath']);
  deck.switchTo('bgm-lv2');
  deck.switchTo('bgm-lv3');
  settle();
  assert.deepEqual(sounding(), ['bgm-lv3']);
});

test('fade-out leaves nothing playing, and ends the track even when the next change comes at once', () => {
  const { deck, settle, sounding } = rig();
  deck.start('boss-bgm');
  deck.fadeOut(350);
  deck.switchTo('bgm-lv2');
  settle();
  assert.deepEqual(sounding(), ['bgm-lv2']);
  deck.fadeOut(350);
  settle();
  assert.deepEqual(sounding(), []);
});

test('fade-out while held ends the tracks at once', () => {
  const { deck, settle, sounding } = rig();
  deck.start('boss-bgm');
  deck.hold();
  settle();
  deck.fadeOut(350);
  assert.deepEqual(sounding(), []);
  settle();
});

test('the bosses each have a track of their own, and the boss assets load every one', () => {
  const keys = BOSSES.map(b => b.music);
  assert.equal(new Set(keys).size, BOSSES.length);
  // The boss packs (systems/PackLoader.ts): each boss's own track loads with his pack
  const loader = readFileSync(new URL('../src/systems/PackLoader.ts', import.meta.url), 'utf8');
  const block = loader.slice(loader.indexOf('const BOSS_PACKS'), loader.indexOf('function sfx('));
  for (const key of keys) assert.ok(block.includes(`['${key}', `), `${key} is not in BOSS_PACKS`);
});

test('every boss: his own track off the pre-battle loop, his fight asking for it changes nothing, then the screens after', () => {
  for (const boss of BOSSES) {
    const { deck, step, settle, sounding, tracks, setPaused } = rig();
    deck.start('bgm-lv2');
    // The versus splash
    deck.switchTo('boss-prelude', 400);
    settle();
    // The press: endPrelude brings in his track (BossEncounter hands it boss.music)
    deck.switchTo(boss.music, 500);
    step(0.3);
    assert.deepEqual(sounding(), ['boss-prelude', boss.music]);
    settle();
    const his = deck.current;
    // His fight, once its intro is over, asks for its music: the same track plays on, not started again
    deck.switchTo(boss.music);
    assert.equal(deck.current, his, `${boss.id}: his track was restarted`);
    assert.equal(tracks.filter(t => t.key === boss.music).length, 1);
    // The pause in the middle of the fight holds his track and lets it go on
    setPaused(true);
    deck.hold();
    settle();
    assert.equal(tracks.find(t => t.key === boss.music)!.paused, true);
    setPaused(false);
    deck.release();
    settle();
    assert.deepEqual(sounding(), [boss.music]);
    assert.equal(tracks.find(t => t.key === boss.music)!.level, MUSIC_LEVEL);
    // He falls: his track fades under the stinger, the ability screen's loop, then the level and the next one
    deck.fadeOut(350);
    step(0.5);
    deck.switchTo('boss-aftermath');
    settle();
    assert.deepEqual(sounding(), ['boss-aftermath']);
    deck.switchTo('bgm-lv2');
    step(0.02);
    deck.switchTo('bgm-lv3');
    settle();
    assert.deepEqual(sounding(), ['bgm-lv3'], boss.id);
  }
});

test('a track not in yet: silence instead of the last moment\'s track, and it comes in as it lands', () => {
  const { deck, settle, sounding, arrive, tracks } = rig(['boss-aftermath']);
  deck.start('boss-bgm');
  deck.fadeOut(350);
  deck.switchTo('boss-aftermath');
  settle();
  assert.deepEqual(sounding(), []);
  assert.equal(deck.wanted, 'boss-aftermath');
  arrive('boss-aftermath');
  settle();
  assert.deepEqual(sounding(), ['boss-aftermath']);
  assert.equal(tracks.find(t => t.key === 'boss-aftermath')!.level, MUSIC_LEVEL);
});

test('a track that lands after its moment is over never plays', () => {
  const { deck, settle, sounding, arrive } = rig(['boss-aftermath']);
  deck.start('bgm-lv2');
  deck.switchTo('boss-aftermath');
  settle();
  // The ability screen is dismissed before its loop is in: back to the level
  deck.switchTo('bgm-lv2');
  settle();
  arrive('boss-aftermath');
  settle();
  assert.deepEqual(sounding(), ['bgm-lv2']);
});

test('the versus press with the boss\'s track not in: the level plays meanwhile, his fight asking changes nothing, his track comes in as it lands', () => {
  const { deck, settle, sounding, arrive } = rig(['lodzia-bgm']);
  deck.start('bgm-lv2');
  deck.switchTo('boss-prelude', 400);
  settle();
  deck.switchTo('lodzia-bgm', 500, 'bgm-lv2');
  settle();
  assert.deepEqual(sounding(), ['bgm-lv2']);
  deck.switchTo('lodzia-bgm');
  settle();
  assert.deepEqual(sounding(), ['bgm-lv2'], 'the fight asking for the awaited track silenced the fallback');
  arrive('lodzia-bgm');
  settle();
  assert.deepEqual(sounding(), ['lodzia-bgm']);
});

test('the pre-battle loop not in: the level\'s music goes, and the loop comes in if the splash is still up', () => {
  const { deck, settle, sounding, arrive } = rig(['boss-prelude']);
  deck.start('bgm-lv2');
  deck.switchTo('boss-prelude', 400);
  settle();
  assert.deepEqual(sounding(), []);
  arrive('boss-prelude');
  settle();
  assert.deepEqual(sounding(), ['boss-prelude']);
});

test('a level\'s music kept until the next level\'s lands, and a stale wait dropped', () => {
  const { deck, settle, sounding, arrive } = rig(['bgm-lv3', 'bgm-lv4']);
  deck.start('bgm-lv2');
  deck.switchTo('bgm-lv3', undefined, deck.key);
  settle();
  assert.deepEqual(sounding(), ['bgm-lv2']);
  deck.switchTo('bgm-lv4', undefined, deck.key);
  arrive('bgm-lv3');
  settle();
  assert.deepEqual(sounding(), ['bgm-lv2'], 'level 3\'s track came in after the run had reached level 4');
  arrive('bgm-lv4');
  settle();
  assert.deepEqual(sounding(), ['bgm-lv4']);
});

test('a run\'s first track not in: silence, then it fades in; stop or a fade-out drops the wait', () => {
  const { deck, settle, sounding, arrive } = rig(['bgm-lv5', 'bgm-lv6']);
  deck.start('bgm-lv5');
  assert.deepEqual(sounding(), []);
  arrive('bgm-lv5');
  settle();
  assert.deepEqual(sounding(), ['bgm-lv5']);
  deck.switchTo('bgm-lv6');
  deck.stop();
  arrive('bgm-lv6');
  settle();
  assert.deepEqual(sounding(), []);
});

test('a track landing while held waits, held, for the release', () => {
  const { deck, settle, sounding, arrive, tracks } = rig(['boss-aftermath']);
  deck.start('bgm-lv2');
  deck.switchTo('boss-aftermath');
  settle();
  deck.hold();
  settle();
  arrive('boss-aftermath');
  assert.equal(tracks.find(t => t.key === 'boss-aftermath')!.paused, true);
  deck.release();
  settle();
  assert.deepEqual(sounding(), ['boss-aftermath']);
});

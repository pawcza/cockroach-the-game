import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { BOSS_TRIGGER_DISTANCE } from '../server/bossDistances';
import { LEVELS, levelBefore, levelConfig, lookLevel } from '../src/config/levels';
import {
  ENDLESS_LOOKS, type PackId, type PackManifest, RUN_ENEMIES, aheadNeeds, atlasKey, enemiesOfTier, matchRequires, nextBossAfter,
  packAssets, startPlan, streamOrder,
} from '../src/config/packs';
import { CAST, ENEMIES, ENEMY_SOUNDS, type EnemyId, MAX_CAST_LEVEL, SKIN_PARTS, cruiseSpeed, firstLevelOf } from '../src/objects/obstacles/cast';

const LADDER = (Object.entries(BOSS_TRIGGER_DISTANCE) as [keyof typeof BOSS_TRIGGER_DISTANCE, number][])
  .map(([id, triggerDistance]) => ({ id, triggerDistance }));
const STARTS = LEVELS.map(l => l.distanceThreshold);
const manifest = JSON.parse(readFileSync('public/assets/packs.json', 'utf8')) as PackManifest;

type Frames = Record<string, { frame: { x: number; y: number; w: number; h: number }; pivot: { x: number; y: number } }>;
const paths = [manifest.core, ...Object.values(manifest.enemies), ...Object.values(manifest.skins).flat(), ...Object.values(manifest.roach)];
const atlases: [string, Frames][] = paths
  .map(path => [path, (JSON.parse(readFileSync(`public/assets/${path}.json`, 'utf8')) as { frames: Frames }).frames]);

/** Python with Pillow decodes the webp atlases; without it (a bare CI image) the pixel tests are skipped. */
const python = spawnSync('python3', ['-c', 'import PIL, numpy'], { encoding: 'utf8' }).status === 0;

test('a run starts with every enemy\'s art and its level\'s images; the worn skin only within its grace', () => {
  const from0 = startPlan({ level: 1, nextBoss: nextBossAfter(0, LADDER), wornSkin: null });
  assert.deepEqual(new Set(from0.required), new Set<PackId>([...RUN_ENEMIES, 'level-1']));
  assert.deepEqual(from0.grace, []);
  for (const id of ['audio-1', 'level-2', 'skins-2', 'audio-2', 'boss-common', 'boss-lodzia'] as PackId[]) assert.ok(from0.soon.includes(id), id);
  // From a checkpoint (the boss beaten there is behind it), and a daily run (the start, like any solo run from 0)
  assert.equal(nextBossAfter(250, LADDER), 'bigos');
  assert.equal(nextBossAfter(1200, LADDER), 'zlewiatan');
  assert.equal(nextBossAfter(1800, LADDER), 'eksterminator');
  assert.equal(nextBossAfter(2600, LADDER), null);
  const baltic = startPlan({ level: 7, nextBoss: 'zlewiatan', wornSkin: 'lawa', otherSkins: ['metal'] });
  assert.deepEqual(new Set(baltic.required), new Set<PackId>([...RUN_ENEMIES, 'level-7']));
  assert.deepEqual(baltic.grace, ['roach-lawa']);
  for (const id of ['audio-7', 'level-8', 'boss-zlewiatan', 'roach-metal'] as PackId[]) {
    assert.ok(baltic.soon.includes(id) && !baltic.required.includes(id), `${id} is never waited for`);
  }
  // Music, the next level and the next boss never hold a start
  for (const plan of [from0, baltic]) {
    assert.ok(!plan.required.some(id => id.startsWith('audio-') || id.startsWith('boss-') || id.startsWith('skins-')));
  }
});

test('the endless levels: every level\'s look, skins and sound asked for from level 10 on and at the endless start, never waited for', () => {
  const all = new Set<PackId>(Array.from({ length: 10 }, (_, i) => [`level-${i + 1}`, `skins-${i + 1}`, `audio-${i + 1}`] as PackId[]).flat());
  assert.deepEqual(new Set(ENDLESS_LOOKS), all);
  assert.ok(!aheadNeeds(9, 'zlewiatan').includes('skins-2'), 'not before level 10');
  const look = (level: number): number => lookLevel(levelConfig(level, 77));
  for (const level of [10, 11, 17]) {
    const ahead = aheadNeeds(level, level === 10 ? 'eksterminator' : null, look);
    for (const id of all) assert.ok(ahead.includes(id), `${id} at level ${level}`);
    // The looks the next levels wear come first
    assert.equal(ahead[0], `level-${look(level)}`);
    assert.equal(ahead[3], `level-${look(level + 1)}`);
  }
  const endless = startPlan({ level: 11, nextBoss: null, wornSkin: null, look });
  assert.deepEqual(new Set(endless.required), new Set<PackId>([...RUN_ENEMIES, `level-${look(11)}`]));
  for (const id of all) assert.ok(endless.required.includes(id) || endless.soon.includes(id), id);
  assert.ok(!endless.required.some(id => id.startsWith('audio-') || id.startsWith('skins-')));
});

test('a match starts on what the lobby made sure of, and never waits for anything else', () => {
  const match = startPlan({ level: 1, nextBoss: 'zlewiatan', wornSkin: 'lawa', otherSkins: ['metal'], match: true });
  assert.deepEqual(match.required, matchRequires());
  assert.deepEqual(new Set(matchRequires()), new Set<PackId>([...RUN_ENEMIES, 'level-1']));
  assert.deepEqual(match.grace, []);
  assert.ok(match.soon.includes('boss-zlewiatan') && match.soon.includes('roach-lawa') && match.soon.includes('roach-metal'));
});

test('a run keeps its own level\'s look, the next two and the next boss coming, nothing past the last level', () => {
  assert.deepEqual(new Set(aheadNeeds(3, 'bigos')), new Set<PackId>([
    'level-3', 'skins-3', 'audio-3', 'level-4', 'skins-4', 'audio-4', 'level-5', 'skins-5', 'audio-5', 'boss-common', 'boss-bigos',
  ]));
  assert.ok(!aheadNeeds(9, null).some(id => /-11$/.test(id)));
});

test('the menu streams every enemy first, then level by level with Lodzia at level 3\'s door; old art and shop skins last', () => {
  const order = streamOrder(LADDER, STARTS, ['zombie', 'lawa']);
  assert.deepEqual(order.slice(0, RUN_ENEMIES.length), [...RUN_ENEMIES]);
  assert.deepEqual(order.slice(RUN_ENEMIES.length, RUN_ENEMIES.length + 6), ['audio-1', 'level-2', 'skins-2', 'audio-2', 'boss-common', 'boss-lodzia']);
  assert.equal(new Set(order).size, order.length);
  for (let level = 2; level <= MAX_CAST_LEVEL; level++) assert.ok(order.includes(`level-${level}`) && order.includes(`audio-${level}`));
  for (const boss of LADDER) assert.ok(order.includes(`boss-${boss.id}`));
  assert.ok(!order.includes('level-1'), 'boot has it');
  assert.deepEqual(order.slice(-3), ['enemies-legacy', 'roach-zombie', 'roach-lawa']);
  assert.ok(order.indexOf('boss-bigos') < order.indexOf('level-7'));
});

test('each enemy\'s art is in the tier of the first level that fields it; no run reaches the legacy art', () => {
  const where = new Map<string, string>();
  for (const [path, frames] of atlases) for (const name of Object.keys(frames)) where.set(name, path);
  for (const id of Object.keys(ENEMIES) as EnemyId[]) {
    const first = firstLevelOf(id);
    const fielded = Object.values(CAST).some(row => row[id] !== undefined) || id === 'catChase' || id === 'sprayWall';
    for (const anim of new Set([ENEMIES[id].art, ...(SKIN_PARTS[id] ?? [])])) {
      assert.equal(where.get(`${anim}_0`), `enemies/${first === null ? 'legacy' : `lv${first}`}`, `${id}'s ${anim}`);
      if (fielded) assert.notEqual(where.get(`${anim}_0`), 'enemies/legacy', `${id} is fielded, its art is required`);
    }
  }
  // Those no level fields (the pope, the black hole) sound with the legacy art
  const legacy = (packAssets('enemies-legacy', manifest, {}) ?? []).map(a => a.key);
  for (const id of enemiesOfTier(null)) for (const key of ENEMY_SOUNDS[id] ?? []) assert.ok(legacy.includes(key), `${key} with enemies-legacy`);
  for (let level = 1; level <= MAX_CAST_LEVEL; level++) {
    const sounds = (packAssets(`audio-${level}`, manifest, {}) ?? []).map(a => a.key);
    for (const id of enemiesOfTier(level)) for (const key of ENEMY_SOUNDS[id] ?? []) assert.ok(sounds.includes(key), `${key} with audio-${level}`);
  }
});

test('a level\'s images, skins sheets and sound are packs of their own; only baked skins\' sounds are asked for', () => {
  const sounds = { 'lv5-goose': { 'hen-cluck': 'lv5-goose-hen-cluck' }, 'lv5-carp': { 'frog-croak': 'lv5-carp-frog-croak' } };
  const baked: PackManifest = { ...manifest, skins: { 5: ['skins/lv5', 'skins/lv5-2'] }, baked: ['lv5-goose'] };
  assert.deepEqual(packAssets('level-5', baked, sounds)?.map(a => a.key), ['lv5-sky', 'lv5-bg', 'lv5-fg', 'lv5-floor']);
  assert.deepEqual(packAssets('skins-5', baked, sounds)?.map(a => a.key), [atlasKey('skins/lv5'), atlasKey('skins/lv5-2')]);
  assert.ok(packAssets('skins-5', baked, sounds)?.every(a => a.kind === 'atlas' && a.optional));
  const audio = packAssets('audio-5', baked, sounds)?.map(a => a.key) ?? [];
  assert.ok(audio.includes('bgm-lv5') && audio.includes('lv5-goose-hen-cluck'));
  assert.ok(!audio.includes('lv5-carp-frog-croak'), 'not baked: nothing of its own is asked for');
  assert.deepEqual(packAssets('skins-4', { ...manifest, skins: {} }, sounds), []);
});

test('the run\'s level is a function of distance and the boss gate only: nothing loaded or not changes it', () => {
  // The state side of LevelProgression asks nothing of the loader before moving the run's level...
  const source = readFileSync('src/systems/LevelProgression.ts', 'utf8');
  const update = source.slice(source.indexOf('  update(distance: number): void {'), source.indexOf('  /**', source.indexOf('  update(distance')));
  assert.ok(update.includes('this.run.currentLevel = config.level'));
  assert.ok(!/levelReady|textures|cache\.|exists/.test(update.slice(0, update.indexOf('this.present()'))), update);
  // ...and the level it moves to is the course's own rule, the one the speed formula and the course read
  assert.ok(update.includes('levelBefore(distance, this.gate, this.lookSeed)'));
  assert.equal(levelBefore(260, 250).level, 2, 'held at level 2 until Lodzia falls');
  assert.equal(levelBefore(260, 1200).level, 3);
  assert.ok(cruiseSpeed(30_000, levelBefore(1300, 1800).level) > cruiseSpeed(30_000, levelBefore(1300, 1200).level));
});

test('the course is laid without asking what has loaded', () => {
  // Every slot is built whatever the loader says: SpawnManager has no way to ask it
  const source = readFileSync('src/systems/SpawnManager.ts', 'utf8');
  for (const word of ['packs', 'PackLoader', 'loader', 'Ready', 'textures.exists', 'hasFrame']) assert.ok(!source.includes(word), word);
  const spawner = readFileSync('src/objects/ObstacleSpawner.ts', 'utf8');
  assert.ok(!/packs|PackLoader|loader/.test(spawner));
});

test('the packs hold every frame of the single atlas they replaced, exactly once, pixel for pixel', { skip: !python && 'no python3 with Pillow' }, () => {
  const old = JSON.parse(readFileSync('tests/fixtures/atlas-v23-frames.json', 'utf8')) as Record<string, [number, number, number, number, string]>;
  const hashes = JSON.parse(spawnSync('python3', ['tests/support/atlas_hashes.py'], { encoding: 'utf8', maxBuffer: 1 << 26 }).stdout) as Record<string, string[]>;
  const found = new Map<string, Frames[string]>();
  for (const [, frames] of atlases) for (const [name, frame] of Object.entries(frames)) found.set(name, frame);
  for (const [name, [w, h, px, py, sha]] of Object.entries(old)) {
    assert.equal(hashes[name]?.length, 1, `${name} once`);
    assert.equal(hashes[name][0], sha, `${name}'s pixels`);
    const f = found.get(name)!;
    assert.deepEqual([f.frame.w, f.frame.h, f.pivot.x, f.pivot.y], [w, h, px, py], name);
  }
  for (const [name, list] of Object.entries(hashes)) assert.equal(list.length, 1, `${name} in one atlas`);
});

test('every atlas fits the 2048 px phones take', () => {
  for (const [path, frames] of atlases) {
    const right = Math.max(...Object.values(frames).map(f => f.frame.x + f.frame.w));
    const bottom = Math.max(...Object.values(frames).map(f => f.frame.y + f.frame.h));
    assert.ok(right <= 2048 && bottom <= 2048, `${path}: ${right}x${bottom}`);
  }
});

test('the bake splits skins over sheets by animation and never leaves its output half-written', { skip: !python && 'no python3 with Pillow' }, () => {
  const run = spawnSync('python3', ['tests/support/bake_packing.py'], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout) as { sheets: string[][]; single: [string, number, number][]; tooBig: boolean; untouched: string[]; published: string[] };
  // Under a tiny cap: three sheets, no animation across two
  assert.deepEqual(report.sheets, [['a_0', 'a_1', 'a_2'], ['b_0', 'b_1', 'b_2'], ['c_0', 'c_1', 'c_2']]);
  // With room: one sheet, laid as a single atlas always was (left to right)
  assert.deepEqual(report.single.map(([, x]) => x), [0, 20, 40, 60, 80, 100, 120, 140, 160]);
  assert.ok(report.tooBig, 'an animation larger than a sheet stops the bake');
  assert.deepEqual(report.untouched, ['keep.json', 'skins/lv2.webp'], 'a failed bake changes nothing');
  assert.deepEqual(report.published, ['keep.json', 'skins/lv3-2.json', 'skins/lv3-2.webp', 'skins/lv3-3.json', 'skins/lv3-3.webp',
    'skins/lv3.json', 'skins/lv3.webp'], 'a finished one drops the sheets it no longer makes');
});

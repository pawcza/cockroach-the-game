import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { ENEMY_SKINS, SKIN_CAUSES } from '../server/enemySkins';
import { parseDeathCause, parseRunStats, parseScoreSubmission } from '../server/validate';
import { SeededRNG } from '../src/multiplayer/SeededRNG';
import {
  BORROWED, CAST, CODE_COLORS, ENDLESS_CAST, ENEMIES, MAX_CAST_LEVEL, SKINS, SKIN_PARTS, type EnemyId, placeOf, skinArt,
  skinBaked, skinFor, skinOfCause, skinsOf,
} from '../src/objects/obstacles/cast';
import { CourseLayout } from '../src/systems/CourseLayout';
import { beatSpacing } from '../src/systems/RunPatterns';

const skins = Object.values(SKINS);

test('every skin stands in for an enemy its level fields, one skin per enemy and level', () => {
  const slots = new Set<string>();
  for (const skin of skins) {
    assert.ok(CAST[skin.level][skin.base] !== undefined, `${skin.id}: ${skin.base} is in level ${skin.level}'s cast`);
    assert.ok(skin.level >= 2 && skin.level <= MAX_CAST_LEVEL, `${skin.id}: level 1 has no skins, the last level is 10`);
    assert.match(skin.id, new RegExp(`^lv${skin.level}-[a-z-]+$`), `${skin.id} is named for its level`);
    assert.ok(SKIN_PARTS[skin.base], `${skin.id}: its base's parts are known`);
    const slot = `${skin.base}@${skin.level}`;
    assert.ok(!slots.has(slot), `${slot} has one skin`);
    slots.add(slot);
    assert.ok(skin.name.length > 0 && skin.headline.length > 0, `${skin.id} has a name and a headline`);
  }
  assert.equal(skins.length, 68);
  for (const borrowed of BORROWED) {
    assert.ok(CAST[borrowed.level][borrowed.base] !== undefined && CAST[borrowed.level][borrowed.as] !== undefined);
    assert.ok(!slots.has(`${borrowed.base}@${borrowed.level}`), 'a borrowed look is not a skin too');
  }
});

test('a skin id is never an enemy\'s own death cause', () => {
  const own = new Set(Object.values(ENEMIES).map(def => def.type));
  for (const id of SKIN_CAUSES) assert.ok(!own.has(id), id);
  assert.deepEqual([...SKIN_CAUSES].sort(), Object.keys(SKINS).sort());
});

test('a skin shows in exactly its level; level 1 has none; level 10\'s pest control as itself', () => {
  assert.equal(skinFor('hen', 5).skin?.id, 'lv5-goose');
  assert.equal(skinFor('hen', 4).skin, null);
  assert.equal(skinFor('hen', 6).skin, null);
  for (const id of Object.keys(ENEMIES) as EnemyId[]) assert.deepEqual(skinFor(id, 1), { skin: null, as: null });
  assert.equal(skinFor('cat', 10).skin?.id, 'lv10-mutant');
  assert.equal(skinFor('bison', 10).skin?.id, 'lv10-trolley');
  assert.equal(skinFor('hedgehog', 10).skin?.id, 'lv10-wire');
  for (const id of ['zapper', 'robotVacuum', 'aerosol', 'repeller', 'bait'] as EnemyId[]) assert.deepEqual(skinFor(id, 10), { skin: null, as: null });
  assert.equal(skinFor('bird', 10).as, null, 'the pigeon borrows the gull only at the Baltic');
  for (const skin of skins) assert.equal(skinFor(skin.base, skin.level).skin, skin);
});

test('at the Baltic the pigeon is drawn as the gull: its look, sounds and death cause, its own swoop', () => {
  assert.deepEqual(skinFor('bird', 7), { skin: null, as: 'gull' });
  assert.equal(skinFor('bird', 6).as, null);
  assert.equal(skinFor('bird', 6).skin?.id, 'lv6-coaster');
  assert.equal(ENEMIES.gull.type, 'gull');
  assert.equal(ENEMIES.bird.role, ENEMIES.gull.role);
});

test('picking a skin draws from nothing: the same slot gets the same answer every time', () => {
  for (let i = 0; i < 3; i++) assert.equal(skinFor('aerosol', 8).skin?.id, 'lv8-moonrock');
});

test('in the endless levels any enemy shows in any of its own skins from any level, or as itself, by look seed and slot', () => {
  for (const id of Object.keys(ENDLESS_CAST) as EnemyId[]) {
    const own = new Set(skinsOf(id).map(skin => skin.id));
    const seen = new Set<string>();
    for (let x = 0; x < 400; x++) {
      for (const seed of [1, 99, 20261114]) {
        const { skin, as } = skinFor(id, 11 + (x % 20), { seed, x: 131_000 + x * 300 });
        assert.equal(as, null, 'no borrowed looks in endless');
        if (skin) assert.ok(own.has(skin.id) && skin.base === id, `${id} in ${skin.id}`);
        seen.add(skin?.id ?? 'base');
      }
    }
    // Every one of its skins comes up, and so does its own look
    assert.deepEqual([...seen].sort(), [...own, 'base'].sort(), id);
  }
  // A skin of any level: the toadstool and the moon rock wherever
  const levels = new Set<number>();
  for (let x = 0; x < 2000; x++) levels.add(skinFor('aerosol', 14, { seed: 7, x: x * 17 }).skin?.level ?? 0);
  assert.ok(levels.size >= 3, [...levels].join());
  // The same seed, slot and enemy: the same look, on every client and every time; without a slot, the enemy itself
  assert.deepEqual(skinFor('onion', 12, { seed: 5, x: 140_000 }), skinFor('onion', 12, { seed: 5, x: 140_000 }));
  assert.deepEqual(skinFor('onion', 12), { skin: null, as: null });
});

test('an endless course is the same course whatever looks its slots get: no skin is drawn from its random source', () => {
  const lay = (looks: boolean): string => {
    const layout = new CourseLayout(new SeededRNG(4242));
    const slots: string[] = [];
    for (let i = 0, x = 130_150; i < 600; i++, x += beatSpacing(14)) {
      const items = layout.next(x, 14);
      for (const item of items) if (looks && item.kind === 'enemy') skinFor(item.plan.id as EnemyId, 14, { seed: 99, x: item.plan.x });
      slots.push(JSON.stringify(items));
    }
    return slots.join('\n');
  };
  const random = Math.random;
  Math.random = () => { throw new Error('a look drew from Math.random'); };
  try {
    assert.equal(lay(true), lay(false));
  } finally {
    Math.random = random;
  }
});

test('a skin lights up only once every frame of every part it replaces is loaded', () => {
  const goose = SKINS['lv5-goose'];
  const frames = (anim: string): number => ({ hen: 2, 'hen-head': 1 } as Record<string, number>)[anim] ?? 0;
  const loaded = (names: string[]) => (frame: string) => names.includes(frame);
  assert.equal(skinBaked(goose, frames, () => false), false, 'not baked yet: the base shows');
  assert.equal(skinBaked(goose, frames, loaded(['lv5-goose/hen_0', 'lv5-goose/hen_1'])), false, 'its head missing');
  assert.equal(skinBaked(goose, frames, loaded(['lv5-goose/hen_0', 'lv5-goose/hen-head_0'])), false, 'a frame missing');
  assert.equal(skinBaked(goose, frames, loaded(['lv5-goose/hen_0', 'lv5-goose/hen_1', 'lv5-goose/hen-head_0'])), true);
  assert.equal(skinBaked(goose, () => 0, () => true), false, 'its base not loaded: nothing to match');
  assert.equal(skinArt('lv5-goose', 'hen-head'), 'lv5-goose/hen-head');
});

test('a skin never moves or resizes its enemy\'s hurt zone: it has no placement of its own', () => {
  // The body rides with the sprite, so a picture offset would move the hitbox: a skin stands where its base does
  for (const s of skins) assert.ok(!('place' in s), `${s.id} has no placement`);
  assert.equal(placeOf.length, 1, 'placement is the enemy\'s alone');
  // And its body is sized from its base's frame, whatever the size of its own (ObstacleKit.enemy, fitBodyAs)
  const kit = readFileSync('src/objects/obstacles/ObstacleKit.ts', 'utf8');
  assert.ok(kit.includes('const bodyAs = art === def.art ? undefined : def.frame'));
  assert.ok(kit.includes('const place = look.place'));
});

test('a skin\'s code-drawn colours default to its base\'s', () => {
  for (const s of skins) for (const [part, color] of Object.entries(s.colors ?? {})) {
    // A colour, or null for a part the skin doesn't draw
    assert.ok(part in CODE_COLORS && (color === null || (Number.isInteger(color) && color >= 0 && color <= 0xffffff)), `${s.id}.${part}`);
  }
  // ...and never names a frame itself: a skinned sprite's frames are its look's (a literal 'hedgehog_1' on the
  // wire ball's texture is a missing frame)
  for (const base of Object.keys(SKIN_PARTS)) {
    const file = { spray: 'pestSpray', cat: 'catPaw', flipper: 'swatter', newspaper: 'swatter' }[base] ?? base;
    const source = readFileSync(`src/objects/obstacles/${file}.ts`, 'utf8');
    assert.ok(!/setFrame\(\s*[`'"]/.test(source), `${file} sets a frame by name`);
  }
  // Every enemy a skin stands in for takes its sounds through its look (bison and hedgehog too, since level 10)
  for (const file of ['bison', 'hedgehog']) assert.ok(readFileSync(`src/objects/obstacles/${file}.ts`, 'utf8').includes('look.sound('), file);
  // The spawn files ask their look for these, never name the hex
  for (const [file, parts] of Object.entries({ hen: ['neck'], frog: ['tongue', 'tongueDark', 'tongueTip'], zapper: ['cord', 'bolt', 'boltCore'],
    repeller: ['ring', 'ringDark'], aerosol: ['blastRing'] })) {
    const source = readFileSync(`src/objects/obstacles/${file}.ts`, 'utf8');
    for (const part of parts) assert.ok(source.includes(`look.color('${part}')`), `${file} ${part}`);
    for (const part of parts) assert.ok(!source.includes(CODE_COLORS[part as keyof typeof CODE_COLORS].toString(16).padStart(6, '0')), `${file} names ${part}'s hex`);
  }
});

test('the server knows every skin\'s death cause and nothing made up', () => {
  for (const id of Object.keys(ENEMY_SKINS)) {
    assert.equal(parseDeathCause(id), id);
    assert.equal(parseRunStats({ obstacleType: id }).obstacleType, id);
    const entry = parseScoreSubmission({ name: 'a', score: 1, deathCause: id });
    assert.ok(!('error' in entry) && entry.deathCause === id);
  }
  for (const junk of ['lv5-goose ', 'LV5-GOOSE', 'lv99-thing', 'lv5-', '__proto__', 'toString', 'constructor', 'lv5-goose/hen', '']) {
    assert.equal(parseDeathCause(junk), null, JSON.stringify(junk));
  }
  assert.equal(skinOfCause('lv8-moonrock')?.base, 'aerosol');
  assert.equal(skinOfCause('toString'), null);
  assert.equal(skinOfCause('onion'), null);
});

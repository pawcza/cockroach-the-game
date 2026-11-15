/**
 * The achievements (server/achievements.ts): the set's integrity, what a run adds to the stats and how two copies of a
 * profile merge (profileStats.ts), the per-run trackers (RunFeats.ts) and what the page shows (achievementView.ts).
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ACHIEVEMENTS, BOSS_WINS, CARDS, ONE_OFFS, achievementTitle, spaced, type Stats } from '../server/achievements';
import { bossUnmet, cardProgress } from '../src/systems/achievementView';
import { BOSSES } from '../src/systems/boss/bosses';
import { EMPTY, merge, reached, withRun, type RunSnapshot } from '../src/systems/profileStats';
import { ALL_BOSSES, NO_FEATS, RunFeats } from '../src/systems/RunFeats';
import { devRunFrom } from '../src/systems/devRun';

/** The 20 achievements before levels: id, the stat, the threshold and the reward each paid. They must all still be there. */
const BEFORE: [string, keyof Stats, number, number][] = [
  ['poziom-4', 'bestLevel', 4, 60], ['poziom-6', 'bestLevel', 6, 120], ['poziom-8', 'bestLevel', 8, 200], ['poziom-10', 'bestLevel', 10, 400],
  ['piec-tysiecy', 'bestScore', 5000, 100], ['dziesiec-tysiecy', 'bestScore', 10000, 200], ['bog', 'bestScore', 20000, 400],
  ['kombo-30', 'bestCombo', 30, 100], ['kombo-60', 'bestCombo', 60, 250],
  ['na-styk', 'nearMisses', 100, 100], ['przebijak', 'dashThroughs', 100, 100], ['sciana', 'wallsBroken', 25, 120],
  ['pigularz', 'pills', 30, 100], ['piwosz', 'beers', 200, 100], ['sadownik', 'apples', 3000, 150],
  ['maraton', 'distance', 42000, 300], ['wytrwaly', 'runs', 100, 150], ['dnia', 'dailyRuns', 7, 100],
  ['towarzyski', 'matches', 10, 100], ['krol-zjazdu', 'matchWins', 5, 200],
];

const withStat = (stat: keyof Stats, value: number): Stats => ({ ...EMPTY, [stat]: value });

const RUN: RunSnapshot = {
  score: 0, distance: 0, startDistance: 0, level: 1, combo: 0, apples: 0, beers: 0, pills: 0, nearMisses: 0,
  dashThroughs: 0, wallsBroken: 0, kills: 0, seconds: 0, daily: false, feats: NO_FEATS,
};

test('the set: unique ids that fit a profile, every one earnable from zero, none already earned by nothing', () => {
  const ids = ACHIEVEMENTS.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  for (const id of ids) assert.match(id, /^[a-zA-Z0-9-]{1,32}$/, id);
  for (const a of ACHIEVEMENTS) {
    assert.ok(!a.test(EMPTY), `${a.id} is earned by a fresh profile`);
    assert.ok(a.reward > 0 && a.name && a.description, a.id);
  }
  assert.equal(ACHIEVEMENTS.length, CARDS.reduce((n, c) => n + c.levels.length, 0) + ONE_OFFS.length);
});

test('every achievement from before is still there with the same threshold and reward', () => {
  for (const [id, stat, threshold, reward] of BEFORE) {
    const found = ACHIEVEMENTS.find(a => a.id === id);
    assert.ok(found, `${id} is gone`);
    assert.equal(found.reward, reward, `${id} reward`);
    assert.ok(found.test(withStat(stat, threshold)), `${id} at ${threshold}`);
    assert.ok(!found.test(withStat(stat, threshold - 1)), `${id} just under ${threshold}`);
  }
});

test('a card\'s levels rise: a higher number to reach and a higher reward, in one stat, one group', () => {
  for (const card of CARDS) {
    assert.ok(card.levels.length >= 3 && card.levels.length <= 4, card.id);
    card.levels.forEach((level, i) => {
      assert.equal(level.group, card.id);
      assert.equal(level.level, i + 1);
      assert.equal(level.stat, card.stat);
      assert.equal(level.name, card.name);
      if (i === 0) return;
      const before = card.levels[i - 1];
      assert.ok(level.at! > before.at!, `${card.id} level ${i + 1} needs more`);
      assert.ok(level.reward > before.reward, `${card.id} level ${i + 1} pays more`);
    });
  }
  const group = new Set(CARDS.map(c => c.id));
  assert.equal(group.size, CARDS.length);
  assert.ok(ONE_OFFS.every(a => !a.group && !a.level), 'a one-off is not a level');
});

test('a level is earned exactly at its number', () => {
  for (const card of CARDS) {
    for (const level of card.levels) {
      assert.ok(level.test(withStat(card.stat, level.at!)), level.id);
      assert.ok(!level.test(withStat(card.stat, level.at! - 1)), `${level.id} one short`);
    }
  }
});

test('the numbers the set was decided with', () => {
  const at = (id: string): number[] => CARDS.find(c => c.id === id)!.levels.map(l => l.at!);
  assert.deepEqual(at('jablka'), [500, 3000, 10000, 30000]);
  assert.deepEqual(at('dystans'), [10000, 42000, 100000, 250000]);
  assert.deepEqual(at('piwa'), [50, 200, 750]);
  assert.deepEqual(at('pigulki'), [10, 30, 100]);
  assert.deepEqual(at('biegi'), [25, 100, 300]);
  assert.deepEqual(at('styk'), [25, 100, 500]);
  assert.deepEqual(at('dash'), [25, 100, 500]);
  assert.deepEqual(at('strzaly'), [25, 100, 500]);
  assert.deepEqual(at('sciany'), [10, 25, 100]);
  assert.deepEqual(at('codziennie'), [3, 7, 30]);
  assert.deepEqual(at('misje'), [10, 50, 150]);
  assert.deepEqual(at('bez-konca'), [15, 20, 25]);
  assert.equal(ONE_OFFS.length, 25);
  assert.equal(ACHIEVEMENTS.length, 63);
});

test('the endless levels\' card: levels 15, 20 and 25 of a run, on the best level; all four starts for Mapa skrótów', () => {
  const card = CARDS.find(c => c.id === 'bez-konca')!;
  assert.equal(card.stat, 'bestLevel');
  assert.deepEqual(card.levels.map(l => [l.id, l.reward]), [['bez-konca-1', 100], ['bez-konca-2', 250], ['bez-konca-3', 400]]);
  assert.ok(!card.levels[0].test(withStat('bestLevel', 14)) && card.levels[0].test(withStat('bestLevel', 15)));
  // A run from the endless start counts its level 11 only once it is in level 12 (checkpoints.ts levelReached)
  assert.equal(withRun(EMPTY, { ...RUN, startDistance: 2600, level: 16 }, true).bestLevel, 16);
  const skroty = ACHIEVEMENTS.find(a => a.id === 'skroty')!;
  assert.ok(!skroty.test(withStat('checkpoints', 3)) && skroty.test(withStat('checkpoints', 4)));
  assert.match(skroty.description, /4 starty/);
});

test('titles: a level carries its numeral, a one-off its own name', () => {
  assert.equal(achievementTitle(ACHIEVEMENTS.find(a => a.id === 'sadownik')!), 'Sadownik II');
  assert.equal(achievementTitle(ACHIEVEMENTS.find(a => a.id === 'jablka-4')!), 'Sadownik IV');
  assert.equal(achievementTitle(ACHIEVEMENTS.find(a => a.id === 'bog')!), 'Karaluch jest bogiem');
  assert.equal(spaced(30000), '30 000');
});

test('every boss has its achievement and its win stat', () => {
  assert.deepEqual(Object.keys(BOSS_WINS).sort(), BOSSES.map(b => b.id).sort());
  assert.deepEqual([...ALL_BOSSES].sort(), BOSSES.map(b => b.id).sort());
  for (const boss of BOSSES) {
    const achievements = ACHIEVEMENTS.filter(a => a.boss === boss.id);
    assert.equal(achievements.length, 1, boss.id);
    assert.ok(achievements[0].test(withStat(BOSS_WINS[boss.id], 1)));
    assert.ok(!achievements[0].test(EMPTY));
  }
});

test('a one-off pays between 60 and 400', () => {
  for (const a of ONE_OFFS) assert.ok(a.reward >= 60 && a.reward <= 400, `${a.id} pays ${a.reward}`);
});

test('a run adds its totals and takes the larger of its bests, new stats included', () => {
  const stats = withRun({ ...EMPTY, bestKills: 7, moultSaves: 2, noHitBossWins: 1, lodziaWins: 3 }, {
    ...RUN, kills: 12, apples: 40, level: 5,
    feats: { bosses: ['lodzia', 'bigos'], noHitWins: 1, allBosses: false, moultSaves: 3, pacifist: true },
  }, true);
  assert.equal(stats.runs, 1);
  assert.equal(stats.kills, 12);
  assert.equal(stats.bestKills, 12, 'the bigger run');
  assert.equal(stats.lodziaWins, 4);
  assert.equal(stats.bigosWins, 1);
  assert.equal(stats.zlewiatanWins, 0);
  assert.equal(stats.noHitBossWins, 2);
  assert.equal(stats.moultSaves, 5);
  assert.equal(stats.pacifistRuns, 1);
  assert.equal(stats.allBossRuns, 0);
  assert.equal(withRun(stats, { ...RUN, kills: 3 }, true).bestKills, 12, 'a smaller run keeps the best');
});

test('merging two copies keeps the larger of every number, new stats included, and every achievement', () => {
  const a = { stats: { ...EMPTY, runs: 9, bestKills: 4, moultSaves: 12, missionsDone: 3 }, achievements: { 'wylinka-10': 500 } };
  const b = { stats: { ...EMPTY, runs: 4, bestKills: 20, lodziaWins: 2, itemsOwned: 5 }, achievements: { 'kanonada': 700, 'boss-lodzia': 800 } };
  const merged = merge(a, b);
  assert.equal(merged.stats.runs, 9);
  assert.equal(merged.stats.bestKills, 20);
  assert.equal(merged.stats.moultSaves, 12);
  assert.equal(merged.stats.lodziaWins, 2);
  assert.equal(merged.stats.missionsDone, 3);
  assert.equal(merged.stats.itemsOwned, 5);
  assert.deepEqual(Object.keys(merged.achievements).sort(), ['boss-lodzia', 'kanonada', 'wylinka-10']);
  assert.equal(merge(a, null).stats.runs, 9);
  // An older copy with fewer stats than today's set still merges: the missing ones are zero
  const old = { stats: { runs: 1, apples: 500 } as unknown as Stats, achievements: {} };
  assert.equal(merge({ stats: { ...EMPTY, ...old.stats }, achievements: {} }, old).stats.apples, 500);
});

test('whoever earned the old achievements keeps them, and the levels line up with their stats', () => {
  // A profile saved before levels: the old twenty earned, stats as they were then (no new stats at all)
  const oldStats = {
    runs: 120, distance: 50000, apples: 3500, beers: 250, pills: 40, nearMisses: 130, dashThroughs: 150, wallsBroken: 30,
    kills: 0, dailyRuns: 8, matches: 12, matchWins: 6, seconds: 9000, bestScore: 21000, bestDistance: 2300, bestLevel: 10, bestCombo: 61,
  };
  const earned = Object.fromEntries(BEFORE.map(([id]) => [id, 1]));
  const stats = { ...EMPTY, ...oldStats };
  assert.deepEqual(Object.keys(reached(stats, earned)).sort(), BEFORE.map(([id]) => id).sort());
  // ... and each is the level of its card that its old threshold says
  const level = (id: string): number | undefined => ACHIEVEMENTS.find(a => a.id === id)?.level;
  assert.deepEqual(['sadownik', 'maraton', 'piwosz', 'pigularz', 'wytrwaly', 'na-styk', 'przebijak', 'sciana', 'dnia'].map(level), [2, 2, 2, 2, 2, 2, 2, 2, 2]);
  const cards = Object.fromEntries(CARDS.map(c => [c.id, cardProgress(c, stats, earned)]));
  assert.equal(cards.jablka.done, 2, 'the 500 level was never marked earned, but 3500 apples reach it');
  assert.equal(cards.jablka.next?.id, 'jablka-3');
  assert.equal(cards.dystans.done, 2);
  assert.equal(cards.misje.done, 0);
});

test('a card shows its level, what is next and when it is done', () => {
  const apples = CARDS.find(c => c.id === 'jablka')!;
  const none = cardProgress(apples, { ...EMPTY, apples: 120 }, {});
  assert.deepEqual([none.done, none.next?.id, none.value], [0, 'jablka-1', 120]);
  const mid = cardProgress(apples, { ...EMPTY, apples: 1240 }, { 'jablka-1': 1, sadownik: 2 });
  assert.deepEqual([mid.done, mid.next?.id, mid.next?.at], [2, 'jablka-3', 10000]);
  const all = cardProgress(apples, { ...EMPTY, apples: 99999 }, Object.fromEntries(apples.levels.map(l => [l.id, 1])));
  assert.deepEqual([all.done, all.of, all.next], [4, 4, undefined]);
});

test('a boss is not named before the player has met him', () => {
  const lodzia = ACHIEVEMENTS.find(a => a.id === 'boss-lodzia')!;
  const eksterminator = ACHIEVEMENTS.find(a => a.id === 'boss-eksterminator')!;
  assert.equal(bossUnmet(lodzia, EMPTY, {}), true);
  assert.equal(bossUnmet(lodzia, { ...EMPTY, bestDistance: 250 }, {}), false, 'reached his distance');
  assert.equal(bossUnmet(eksterminator, { ...EMPTY, bestDistance: 2000 }, {}), true);
  assert.equal(bossUnmet(eksterminator, { ...EMPTY, bestDistance: 2000 }, { 'boss-eksterminator': 1 }), false, 'earned');
  assert.equal(bossUnmet(ACHIEVEMENTS.find(a => a.id === 'bog')!, EMPTY, {}), false, 'only bosses');
});

// -- The per-run trackers ---------------------------------------------------------------------------------------

const fromStart = { index: 0, level: 1 };

test('a boss beaten without a hit counts as a no-hit win; any hit, the moult\'s absorbed one too, spoils it', () => {
  const feats = new RunFeats();
  feats.begin(fromStart);
  feats.fightStarted();
  feats.bossBeaten('lodzia', true);
  assert.equal(feats.snapshot().noHitWins, 1);

  feats.fightStarted();
  feats.hit(true);
  feats.moulted();
  feats.bossBeaten('bigos', true);
  const snap = feats.snapshot();
  assert.deepEqual(snap.bosses, ['lodzia', 'bigos']);
  assert.equal(snap.noHitWins, 1, 'the second fight took a hit');
  assert.equal(snap.moultSaves, 1);

  // The next fight starts clean again, and a hit between fights is not a hit in one
  feats.hit(false);
  feats.fightStarted();
  feats.bossBeaten('zlewiatan', true);
  assert.equal(feats.snapshot().noHitWins, 2);
});

test('a boss from a match or under a dev shortcut counts for nothing', () => {
  const feats = new RunFeats();
  feats.begin(fromStart);
  feats.bossBeaten('zlewiatan', false);
  assert.deepEqual(feats.snapshot().bosses, []);
  assert.equal(feats.snapshot().noHitWins, 0);
});

test('all four bosses win the run only when it started from 0 m', () => {
  const run = (start: { index: number; level: number }, bosses: typeof ALL_BOSSES): boolean => {
    const feats = new RunFeats();
    feats.begin(start);
    for (const id of bosses) { feats.fightStarted(); feats.bossBeaten(id, true); }
    return feats.snapshot().allBosses;
  };
  assert.equal(run(fromStart, ALL_BOSSES), true);
  assert.equal(run(fromStart, ALL_BOSSES.slice(0, 3)), false);
  // From a checkpoint, the bosses before it are handed over, never fought: the rest can never be all four
  assert.equal(run({ index: 1, level: 3 }, ALL_BOSSES.slice(1)), false);
  assert.equal(run({ index: 1, level: 3 }, ALL_BOSSES), false);
});

test('a run\'s counts start over when the tutorial ends, but it keeps where it started', () => {
  const feats = new RunFeats();
  feats.begin({ index: 1, level: 3 });
  feats.bossBeaten('lodzia', true);
  feats.moulted();
  feats.restart();
  assert.deepEqual(feats.snapshot(), { ...NO_FEATS, allBosses: false });
  for (const id of ALL_BOSSES) feats.bossBeaten(id, true);
  assert.equal(feats.snapshot().allBosses, false, 'still a checkpoint run');
});

test('pacifist: from running into level 7 with the pistol to level 9 with not a shot in between', () => {
  const run = (shots: (level: number) => number): boolean => {
    const feats = new RunFeats();
    feats.begin(fromStart);
    for (let level = 1; level <= 10; level++) {
      feats.observe(level, level >= 7);
      for (let i = 0; i < shots(level); i++) feats.shot();
    }
    return feats.snapshot().pacifist;
  };
  assert.equal(run(() => 0), true);
  assert.equal(run(level => (level === 8 ? 1 : 0)), false, 'a shot in level 8');
  assert.equal(run(level => (level === 7 ? 1 : 0)), false, 'a shot in level 7, after entering it');
  assert.equal(run(level => (level === 6 ? 5 : 0)), true, 'shots before level 7 do not count');
  assert.equal(run(level => (level === 9 ? 1 : 0)), true, 'a shot after entering level 9 is past the stretch');
});

test('the pacifist count is the run\'s pistol alone: nothing in RunFeats counts a boss fight\'s shots', () => {
  // GameInput.fightShoot does not call feats.shot(); the only caller is RunGun's onShot, after a round is taken
  const feats = new RunFeats();
  feats.begin(fromStart);
  for (let level = 1; level <= 10; level++) {
    feats.observe(level, level >= 7);
    if (level === 9) feats.fightStarted(); // the Zlewiatan fight sits between 7 and 9; whatever is shot in it never reaches here
  }
  assert.equal(feats.snapshot().pacifist, true);
});

test('pacifist needs the pistol on entering level 7, and a run that ran into it', () => {
  const noGun = new RunFeats();
  noGun.begin(fromStart);
  for (let level = 1; level <= 10; level++) noGun.observe(level, false);
  assert.equal(noGun.snapshot().pacifist, false, 'no pistol, no pacifist');

  const checkpoint = new RunFeats();
  checkpoint.begin({ index: 2, level: 7 });
  for (let level = 7; level <= 10; level++) checkpoint.observe(level, true);
  assert.equal(checkpoint.snapshot().pacifist, false, 'a run that started in level 7 did not run into it');

  const earlier = new RunFeats();
  earlier.begin({ index: 1, level: 3 });
  for (let level = 3; level <= 10; level++) earlier.observe(level, level >= 7);
  assert.equal(earlier.snapshot().pacifist, true, 'a run from an earlier checkpoint does run into 7');

  // The same frame twice, and a level that goes back, change nothing
  const steady = new RunFeats();
  steady.begin(fromStart);
  [1, 1, 7, 7, 6, 7, 9].forEach(level => steady.observe(level, true));
  assert.equal(steady.snapshot().pacifist, true);
});

test('kills in one run are the bigger of the runs', () => {
  let stats = withRun(EMPTY, { ...RUN, kills: 9 }, true);
  stats = withRun(stats, { ...RUN, kills: 16 }, true);
  stats = withRun(stats, { ...RUN, kills: 4 }, true);
  assert.equal(stats.bestKills, 16);
  assert.equal(stats.kills, 29);
  const kanonada = ACHIEVEMENTS.find(a => a.id === 'kanonada')!;
  assert.ok(kanonada.test(stats));
  assert.ok(!kanonada.test(withRun(EMPTY, { ...RUN, kills: 14 }, true)));
});

// Intended: "Dobiegnij do 3000 m" is about reaching it, the distance the board shows. A run from a checkpoint reports the
// distance from the course's start, so it counts; it cannot get past 2600 m without beating the Eksterminator anyway.
test('3000 m in one run is reaching it: the reported distance counts, a checkpoint run too', () => {
  const far = ACHIEVEMENTS.find(a => a.id === 'trzy-tysiace')!;
  assert.ok(far.test(withRun(EMPTY, { ...RUN, distance: 3100, startDistance: 1800 }, true)));
  assert.ok(!far.test(withRun(EMPTY, { ...RUN, distance: 2999 }, true)));
});

test('a run from a checkpoint is practice: it raises no best score and so no score achievement', () => {
  const ladder = ['piec-tysiecy', 'dziesiec-tysiecy', 'bog', 'piecdziesiat-tysiecy'].map(id => ACHIEVEMENTS.find(a => a.id === id)!);
  const practice = withRun(EMPTY, { ...RUN, score: 60000, distance: 1900, startDistance: 1800 }, true);
  assert.equal(practice.bestScore, 0);
  for (const a of ladder) assert.ok(!a.test(practice), a.id);
  // mid-run too: the achievements are awarded from the run so far
  assert.equal(withRun(EMPTY, { ...RUN, score: 60000, startDistance: 250 }, false).bestScore, 0);
  // a ranked run still raises it, and a later practice run leaves it where it was
  const ranked = withRun(EMPTY, { ...RUN, score: 11000 }, true);
  assert.equal(ranked.bestScore, 11000);
  assert.ok(ladder[1].test(ranked));
  assert.equal(withRun(ranked, { ...RUN, score: 60000, startDistance: 1200 }, true).bestScore, 11000);
  // everything else counts as before: metres run, runs, apples, bests of distance and level
  assert.equal(practice.runs, 1);
  assert.equal(practice.distance, 100);
  assert.equal(practice.bestDistance, 1900);
});

test('names and descriptions fit the toast and the page: one short line each', () => {
  for (const a of ACHIEVEMENTS) {
    assert.ok(a.description.length <= 40, `${a.id}: ${a.description.length} characters`);
    assert.ok(`${achievementTitle(a)}! +${a.reward} okruszków`.length <= 38, `${a.id}'s toast heading`);
  }
});

test('progress never reads as the goal before it is reached', () => {
  const distance = CARDS.find(c => c.id === 'dystans')!;
  assert.equal(distance.format(9950), '9.9 km');
  assert.equal(distance.format(10000), '10 km');
  assert.equal(distance.format(42000), '42 km');
  assert.equal(distance.levels[0].description, 'Przebiegnij łącznie 10 km');
  // Plain numbers are whole numbers, shown as they are
  const apples = CARDS.find(c => c.id === 'jablka')!;
  assert.equal(apples.format(499), '499');
});

test('a run under a dev shortcut is recognised, and only in development', () => {
  assert.equal(devRunFrom('?boss=bigos', true), true);
  assert.equal(devRunFrom('?checkpoints=3', true), true);
  assert.equal(devRunFrom('?checkpoints=', true), true);
  assert.equal(devRunFrom('?debug=1&boss=lodzia', true), true);
  assert.equal(devRunFrom('', true), false);
  assert.equal(devRunFrom('?daily=1', true), false);
  assert.equal(devRunFrom('?boss=bigos&checkpoints=3', false), false, 'production ignores them');
  assert.equal(devRunFrom('?noskins', true), true);
  assert.equal(devRunFrom('?pill', true), true);
  assert.equal(devRunFrom('?noskins&pill', false), false);
});

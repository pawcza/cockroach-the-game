import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SeededRNG } from '../src/multiplayer/SeededRNG';

test('the same seed gives every client the same sequence', () => {
  const a = new SeededRNG(1234);
  const b = new SeededRNG(1234);
  const sequence = Array.from({ length: 1000 }, () => a.next());
  assert.deepEqual(sequence, Array.from({ length: 1000 }, () => b.next()));
});

test('different seeds diverge', () => {
  assert.notEqual(new SeededRNG(1).next(), new SeededRNG(2).next());
});

test('next stays in [0, 1)', () => {
  const rng = new SeededRNG(99);
  for (let i = 0; i < 10_000; i++) {
    const value = rng.next();
    assert.ok(value >= 0 && value < 1);
  }
});

test('between covers both ends of its range and nothing outside it', () => {
  const rng = new SeededRNG(7);
  const seen = new Set(Array.from({ length: 1000 }, () => rng.between(2, 5)));
  assert.deepEqual([...seen].sort(), [2, 3, 4, 5]);
});

test('chance respects certainty at both extremes', () => {
  const rng = new SeededRNG(5);
  for (let i = 0; i < 100; i++) {
    assert.equal(rng.chance(0), false);
    assert.equal(rng.chance(1), true);
  }
});

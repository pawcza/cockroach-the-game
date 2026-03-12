/**
 * Mulberry32 — fast, deterministic 32-bit PRNG.
 * Given the same seed, produces identical sequence on every client.
 */
export class SeededRNG {
  private state: number;

  constructor(seed: number) {
    this.state = seed | 0;
  }

  /** Returns float in [0, 1) — drop-in for Math.random() */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Returns integer in [min, max] inclusive — replaces Phaser.Math.Between */
  between(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  /** Returns true with given probability [0, 1] */
  chance(probability: number): boolean {
    return this.next() < probability;
  }
}

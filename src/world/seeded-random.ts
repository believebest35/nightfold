/**
 * Deterministic pseudo-random number generator (LCG).
 *
 * Same seed → identical sequence, every time. This is the ONLY source
 * of randomness for world generation — Math.random() is forbidden in
 * world/scenery code (plan §11.1).
 */
export class SeededRandom {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Next value in [0, 1). */
  next(): number {
    // Numerical Recipes LCG.
    this.state = (this.state * 1664525 + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  /** Value in [min, max). */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** Integer in [min, max] (inclusive). */
  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1));
  }

  pick<T>(values: readonly T[]): T {
    const index = Math.floor(this.next() * values.length);
    const v = values[index];
    if (v === undefined) throw new Error("pick from empty array");
    return v;
  }

  /** True with probability p. */
  chance(p: number): boolean {
    return this.next() < p;
  }
}

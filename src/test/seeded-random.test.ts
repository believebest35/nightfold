import { describe, it, expect } from "vitest";
import { SeededRandom } from "../world/seeded-random.ts";

describe("SeededRandom", () => {
  it("produces the identical sequence for the same seed", () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = new SeededRandom(1);
    const b = new SeededRandom(2);
    let same = 0;
    for (let i = 0; i < 20; i++) {
      if (a.next() === b.next()) same++;
    }
    expect(same).toBeLessThan(20);
  });

  it("always returns values in [0, 1)", () => {
    const rng = new SeededRandom(20260728);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("range returns values within [min, max)", () => {
    const rng = new SeededRandom(7);
    for (let i = 0; i < 500; i++) {
      const v = rng.range(100, 300);
      expect(v).toBeGreaterThanOrEqual(100);
      expect(v).toBeLessThan(300);
    }
  });

  it("int returns inclusive integer bounds", () => {
    const rng = new SeededRandom(9);
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 500; i++) {
      const v = rng.int(2, 5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      if (v === 2) sawMin = true;
      if (v === 5) sawMax = true;
    }
    expect(sawMin).toBe(true);
    expect(sawMax).toBe(true);
  });

  it("pick returns elements from the array", () => {
    const rng = new SeededRandom(11);
    const values = [10, 20, 30] as const;
    for (let i = 0; i < 100; i++) {
      expect(values).toContain(rng.pick(values));
    }
  });

  it("chance respects the probability boundary", () => {
    const rng = new SeededRandom(13);
    let hits = 0;
    for (let i = 0; i < 1000; i++) {
      if (rng.chance(0.3)) hits++;
    }
    expect(hits).toBeGreaterThan(200);
    expect(hits).toBeLessThan(400);
  });
});

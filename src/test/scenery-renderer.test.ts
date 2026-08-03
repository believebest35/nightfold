import { describe, it, expect } from "vitest";
import {
  lampHeadVisible,
  lampHaloVisible,
  windowCellValue,
  windowCellLit,
  WINDOW_LIT_RATIO,
} from "../render/scenery-renderer.ts";

describe("lampHeadVisible", () => {
  it("shows the head when it rises above the crest clip line", () => {
    // Screen Y grows downward: a smaller topY means the head is higher,
    // so a head above the clip line is visible.
    expect(lampHeadVisible(100, 200)).toBe(true);
  });

  it("hides the head when it lies below the crest clip line", () => {
    expect(lampHeadVisible(300, 200)).toBe(false);
  });

  it("treats a head exactly on the clip line as occluded", () => {
    expect(lampHeadVisible(200, 200)).toBe(false);
  });
});

describe("lampHaloVisible", () => {
  it("never draws a halo when the lamp head itself is hidden", () => {
    expect(lampHaloVisible(false, 1000, 0.1)).toBe(false);
    expect(lampHaloVisible(false, 1000, 0.5)).toBe(false);
    expect(lampHaloVisible(false, 99999, 0.9)).toBe(false);
  });

  it("still applies distance and fog limits when the head is visible", () => {
    expect(lampHaloVisible(true, 1000, 0.1)).toBe(true);
    expect(lampHaloVisible(true, 99999, 0.1)).toBe(false); // too far
    expect(lampHaloVisible(true, 1000, 0.9)).toBe(false); // too foggy
  });
});

describe("windowCellValue", () => {
  it("is deterministic for the same id, row and col", () => {
    const a = windowCellValue("s5-building-left", 3, 4);
    const b = windowCellValue("s5-building-left", 3, 4);
    expect(a).toBe(b);
  });

  it("differs across rows and columns of the same building", () => {
    const base = windowCellValue("s5-building-left", 1, 1);
    let differing = 0;
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        if (windowCellValue("s5-building-left", row, col) !== base) differing++;
      }
    }
    // Nearly every other cell scatters away from (1,1).
    expect(differing).toBeGreaterThan(20);
  });

  it("stays in [0, 1)", () => {
    for (let row = 0; row < 20; row++) {
      for (let col = 0; col < 20; col++) {
        const v = windowCellValue("s7-building-right", row, col);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    }
  });

  it("mixes lit and dark windows within one building", () => {
    // One façade must show a clear lit/dark spread rather than all-or-
    // nothing, with the fraction near WINDOW_LIT_RATIO. Deterministic
    // for a fixed id, so the bounds only need to be sensible.
    const id = "s7-building-right";
    let lit = 0;
    let total = 0;
    for (let row = 0; row < 10; row++) {
      for (let col = 0; col < 8; col++) {
        total++;
        if (windowCellLit(id, row, col)) lit++;
      }
    }
    expect(total).toBe(80);
    expect(lit).toBeGreaterThan(0);
    expect(lit).toBeLessThan(total);
    expect(lit / total).toBeGreaterThan(WINDOW_LIT_RATIO * 0.5);
    expect(lit / total).toBeLessThan(WINDOW_LIT_RATIO * 1.5);
  });

  it("approaches WINDOW_LIT_RATIO over many buildings and cells", () => {
    let lit = 0;
    let total = 0;
    for (let i = 0; i < 200; i++) {
      const id = `s${i}-building-${i % 2 === 0 ? "left" : "right"}`;
      for (let row = 0; row < 10; row++) {
        for (let col = 0; col < 8; col++) {
          total++;
          if (windowCellLit(id, row, col)) lit++;
        }
      }
    }
    const ratio = lit / total;
    // 16000 cells: sd ≈ 0.0034, so 0.2–0.3 is a safe statistical bound.
    expect(ratio).toBeGreaterThan(0.2);
    expect(ratio).toBeLessThan(0.3);
  });
});

import { describe, it, expect } from "vitest";
import { RoadBuilder } from "../world/road-builder.ts";
import { buildDefaultRoad } from "../world/road-generator.ts";
import { gameConfig } from "../config/game-config.ts";

const SEG = gameConfig.segmentLength;

/** Indexed access that throws instead of yielding `undefined`. */
function at(arr: number[], i: number): number {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} out of range`);
  return v;
}

describe("RoadBuilder.addStraight", () => {
  it("creates the requested number of flat straight segments", () => {
    const road = new RoadBuilder().addStraight(10).build();
    expect(road.segments.length).toBe(10);
    for (const seg of road.segments) {
      expect(seg.curve).toBe(0);
      expect(seg.p1.world.worldY).toBe(0);
      expect(seg.p2.world.worldY).toBe(0);
    }
  });
});

describe("RoadBuilder.addCurve", () => {
  it("ramps curvature smoothly from 0 up, holds, and back to 0", () => {
    const road = new RoadBuilder().addCurve(4, 4, 4, 0.5).build();
    const curves = road.segments.map((s) => s.curve);

    // Entry: strictly increasing
    expect(at(curves, 0)).toBeGreaterThan(0);
    expect(at(curves, 1)).toBeGreaterThan(at(curves, 0));
    expect(at(curves, 2)).toBeGreaterThan(at(curves, 1));
    expect(at(curves, 3)).toBeGreaterThan(at(curves, 2));
    // Hold: at target
    expect(at(curves, 4)).toBeCloseTo(0.5);
    expect(at(curves, 5)).toBeCloseTo(0.5);
    expect(at(curves, 6)).toBeCloseTo(0.5);
    expect(at(curves, 7)).toBeCloseTo(0.5);
    // Exit: strictly decreasing back to ~0
    expect(at(curves, 8)).toBeLessThan(at(curves, 7));
    expect(at(curves, 9)).toBeLessThan(at(curves, 8));
    expect(at(curves, 10)).toBeLessThan(at(curves, 9));
    expect(at(curves, 11)).toBeCloseTo(0, 6);
  });

  it("total curvature equals curve * (enter/2 + hold + leave/2)", () => {
    const road = new RoadBuilder().addCurve(10, 20, 10, 0.35).build();
    const total = road.segments.reduce((sum, s) => sum + s.curve, 0);
    expect(total).toBeCloseTo(0.35 * (10 / 2 + 20 + 10 / 2), 9);
  });

  it("keeps height unchanged", () => {
    const road = new RoadBuilder().addCurve(5, 5, 5, 0.3).build();
    for (const seg of road.segments) {
      expect(seg.p1.world.worldY).toBe(0);
      expect(seg.p2.world.worldY).toBe(0);
    }
  });
});

describe("RoadBuilder.addHill", () => {
  it("rises to height, holds, and returns to start height", () => {
    const road = new RoadBuilder().addHill(5, 5, 5, 1200).build();
    const ys = road.segments.map((s) => s.p2.world.worldY);

    // Monotonic rise (segments 0-4)
    expect(at(ys, 0)).toBeGreaterThan(0);
    expect(at(ys, 1)).toBeGreaterThan(at(ys, 0));
    // Peak reached and held (segments 4-9: enter ends at 4, hold is 5-9)
    expect(at(ys, 4)).toBeCloseTo(1200);
    expect(at(ys, 5)).toBeCloseTo(1200);
    expect(at(ys, 9)).toBeCloseTo(1200);
    // Descent back to start (segments 10-14)
    expect(at(ys, 10)).toBeLessThan(at(ys, 9));
    expect(at(ys, 11)).toBeLessThan(at(ys, 10));
    expect(at(ys, 14)).toBeCloseTo(0);
  });

  it("net height change is zero", () => {
    const road = new RoadBuilder().addHill(8, 16, 8, -800).build();
    const last = road.segments[road.segments.length - 1];
    if (!last) throw new Error("missing segment");
    expect(last.p2.world.worldY).toBeCloseTo(0);
  });
});

describe("RoadBuilder.addSCurves", () => {
  it("has zero net curvature", () => {
    const road = new RoadBuilder().addSCurves().build();
    const total = road.segments.reduce((sum, s) => sum + s.curve, 0);
    expect(total).toBeCloseTo(0, 9);
  });
});

describe("RoadBuilder.addZone", () => {
  it("defaults to city before any addZone call", () => {
    const road = new RoadBuilder().addStraight(3).build();
    for (const seg of road.segments) {
      expect(seg.zone).toBe("city");
    }
  });

  it("switches the zone for all subsequently appended segments", () => {
    const road = new RoadBuilder()
      .addStraight(2)
      .addZone("elevated")
      .addStraight(3)
      .addZone("tunnel")
      .addStraight(2)
      .build();
    expect(road.segments.map((s) => s.zone)).toEqual([
      "city", "city",
      "elevated", "elevated", "elevated",
      "tunnel", "tunnel",
    ]);
  });

  it("can switch back to a previous zone", () => {
    const road = new RoadBuilder()
      .addStraight(2)
      .addZone("riverside")
      .addStraight(2)
      .addZone("city")
      .addStraight(2)
      .build();
    expect(road.segments.map((s) => s.zone)).toEqual([
      "city", "city", "riverside", "riverside", "city", "city",
    ]);
  });

  it("does not disturb geometry (zone is orthogonal to curve/height)", () => {
    const withZone = new RoadBuilder()
      .addZone("tunnel")
      .addHill(4, 4, 4, -800)
      .build();
    const plain = new RoadBuilder().addHill(4, 4, 4, -800).build();
    expect(withZone.segments.map((s) => s.curve)).toEqual(
      plain.segments.map((s) => s.curve),
    );
    expect(withZone.segments.map((s) => s.p2.world.worldY)).toEqual(
      plain.segments.map((s) => s.p2.world.worldY),
    );
  });
});

describe("RoadBuilder segment structure", () => {
  it("has consecutive indices and continuous Z", () => {
    const road = new RoadBuilder()
      .addStraight(5)
      .addCurve(3, 3, 3, 0.2)
      .build();
    const { segments } = road;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!seg) throw new Error("missing segment");
      expect(seg.index).toBe(i);
      expect(seg.p1.world.worldZ).toBe(i * SEG);
      expect(seg.p2.world.worldZ).toBe((i + 1) * SEG);
      expect(seg.zone).toBe("city");
    }
  });

  it("alternates colorVariant", () => {
    const road = new RoadBuilder().addStraight(6).build();
    road.segments.forEach((seg, i) => {
      expect(seg.colorVariant).toBe(i % 2);
    });
  });

  it("totalLength matches segment count * segmentLength", () => {
    const road = new RoadBuilder().addStraight(10).build();
    expect(road.totalLength).toBe(10 * SEG);
  });
});

describe("buildDefaultRoad", () => {
  const road = buildDefaultRoad();

  it("produces a substantial loop", () => {
    expect(road.segments.length).toBeGreaterThan(300);
    expect(road.totalLength).toBe(road.segments.length * SEG);
  });

  it("has zero total curvature (loop joins without direction jump)", () => {
    const total = road.segments.reduce((sum, s) => sum + s.curve, 0);
    expect(total).toBeCloseTo(0, 9);
  });

  it("returns to start height (loop joins without height jump)", () => {
    const last = road.segments[road.segments.length - 1];
    if (!last) throw new Error("missing segment");
    expect(last.p2.world.worldY).toBeCloseTo(0);
  });

  it("has no instantaneous curvature jumps", () => {
    // Adjacent smoothstep samples differ by at most ~0.15×curve,
    // so a 0.4 curve legitimately produces ~0.06 per-segment deltas.
    let maxJump = 0;
    for (let i = 1; i < road.segments.length; i++) {
      const prev = road.segments[i - 1];
      const curr = road.segments[i];
      if (!prev || !curr) throw new Error("missing segment");
      maxJump = Math.max(maxJump, Math.abs(curr.curve - prev.curve));
    }
    expect(maxJump).toBeLessThan(0.08);
  });

  it("has no instantaneous height jumps", () => {
    // Steep but never cliff-like: per-segment height delta capped at
    // half a segment length (a 0.5 gradient at worst).
    let maxJump = 0;
    for (let i = 1; i < road.segments.length; i++) {
      const prev = road.segments[i - 1];
      const curr = road.segments[i];
      if (!prev || !curr) throw new Error("missing segment");
      maxJump = Math.max(
        maxJump,
        Math.abs(curr.p1.world.worldY - prev.p1.world.worldY),
      );
    }
    expect(maxJump).toBeLessThan(SEG * 0.5);
  });

  it("contains both left and right turns", () => {
    const curves = road.segments.map((s) => s.curve);
    expect(curves.some((c) => c > 0.2)).toBe(true);
    expect(curves.some((c) => c < -0.2)).toBe(true);
  });

  it("visits the four zones in recipe order (city → elevated → tunnel → riverside → city)", () => {
    const zones = road.segments.map((s) => s.zone);
    // First-occurrence order: the recipe lays out each zone as one block,
    // with a final city block closing the loop.
    expect([...new Set(zones)]).toEqual(["city", "elevated", "tunnel", "riverside"]);
    expect(zones[zones.length - 1]).toBe("city");
    // The city bookends: first block opens the loop, last block closes it.
    const lastCity = zones.lastIndexOf("city");
    expect(lastCity).toBe(zones.length - 1);
  });

  it("gives every zone a long enough block to be recognizable (≥ 20 segments)", () => {
    const zones = road.segments.map((s) => s.zone);
    for (const zone of ["city", "elevated", "tunnel", "riverside"] as const) {
      const count = zones.filter((z) => z === zone).length;
      expect(count).toBeGreaterThanOrEqual(20);
    }
  });

  it("keeps the tunnel over the downhill valley bottom", () => {
    const tunnelSegs = road.segments.filter((s) => s.zone === "tunnel");
    expect(tunnelSegs.length).toBeGreaterThan(0);
    // The tunnel block sits in the -800 dip: its mid segment must be well
    // below the start/end height of the loop.
    const mid = tunnelSegs[Math.floor(tunnelSegs.length / 2)];
    if (!mid) throw new Error("missing tunnel segment");
    expect(mid.p1.world.worldY).toBeLessThan(-400);
  });
});

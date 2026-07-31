import { describe, it, expect } from "vitest";
import { attachScenery } from "../world/scenery-generator.ts";
import { buildDefaultRoad } from "../world/road-generator.ts";
import type { RoadSegment, SceneryObject } from "../model/types.ts";

function serialize(scenery: SceneryObject[][]): string {
  return JSON.stringify(
    scenery.map((arr) => arr.map((o) => [o.id, o.kind, o.side, o.offset, o.width, o.height])),
  );
}

function roadWithScenery(seed: number): RoadSegment[] {
  const road = buildDefaultRoad();
  attachScenery(road.segments, seed);
  return road.segments;
}

describe("attachScenery", () => {
  it("is deterministic for the same seed", () => {
    const a = serialize(roadWithScenery(20260728).map((s) => s.scenery));
    const b = serialize(roadWithScenery(20260728).map((s) => s.scenery));
    expect(a).toBe(b);
  });

  it("differs between seeds", () => {
    const a = serialize(roadWithScenery(1).map((s) => s.scenery));
    const b = serialize(roadWithScenery(2).map((s) => s.scenery));
    expect(a).not.toBe(b);
  });

  it("keeps at most 3 objects per segment", () => {
    const segments = roadWithScenery(99);
    for (const seg of segments) {
      expect(seg.scenery.length).toBeLessThanOrEqual(3);
    }
  });

  it("places streetlights every 6 segments", () => {
    const segments = roadWithScenery(42);
    for (const seg of segments) {
      const lights = seg.scenery.filter((o) => o.kind === "streetlight");
      if (seg.index % 6 === 0) {
        expect(lights.length).toBe(1);
      } else {
        expect(lights.length).toBe(0);
      }
    }
  });

  it("places guardrails on both sides of every segment", () => {
    const segments = roadWithScenery(42);
    for (const seg of segments) {
      const rails = seg.scenery.filter((o) => o.kind === "guardrail");
      expect(rails.filter((r) => r.side === "left").length).toBe(1);
      expect(rails.filter((r) => r.side === "right").length).toBe(1);
    }
  });

  it("generates buildings only on city segments, at most one per segment", () => {
    const segments = roadWithScenery(42);
    for (const seg of segments) {
      const buildings = seg.scenery.filter((o) => o.kind === "building");
      expect(seg.zone).toBe("city"); // default recipe is all city
      expect(buildings.length).toBeLessThanOrEqual(1);
    }
  });

  it("generates at least 3 building height variants", () => {
    const segments = roadWithScenery(42);
    const heights = new Set<number>();
    for (const seg of segments) {
      for (const o of seg.scenery) {
        if (o.kind === "building") {
          heights.add(Math.round(o.height / 100));
        }
      }
    }
    expect(heights.size).toBeGreaterThanOrEqual(3);
  });

  it("keeps objects outside the road shoulder", () => {
    const segments = roadWithScenery(42);
    for (const seg of segments) {
      for (const o of seg.scenery) {
        expect(o.offset).toBeGreaterThan(1000); // roadHalfWidth
      }
    }
  });

  it("assigns stable unique ids", () => {
    const segments = roadWithScenery(42);
    const ids = new Set<string>();
    for (const seg of segments) {
      for (const o of seg.scenery) {
        expect(ids.has(o.id)).toBe(false);
        ids.add(o.id);
      }
    }
  });
});

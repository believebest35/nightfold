import { describe, it, expect } from "vitest";
import {
  attachScenery,
  findRunForIndex,
  findZoneRuns,
  getZoneRunDistances,
} from "../world/scenery-generator.ts";
import { buildDefaultRoad } from "../world/road-generator.ts";
import { gameConfig } from "../config/game-config.ts";
import type { RoadSegment, RoadZone, SceneryObject } from "../model/types.ts";
import { tunnelFade } from "../render/scenery-renderer.ts";

/** Shoulder half-width in world units. */
const SHOULDER_HALF_WIDTH = gameConfig.roadHalfWidth * 1.4;

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

function segmentsForZones(zones: RoadZone[]): RoadSegment[] {
  return zones.map((zone, index) => ({
    index,
    p1: { world: { worldX: 0, worldY: 0, worldZ: index * gameConfig.segmentLength } },
    p2: {
      world: {
        worldX: 0,
        worldY: 0,
        worldZ: (index + 1) * gameConfig.segmentLength,
      },
    },
    curve: 0,
    zone,
    colorVariant: (index % 2) as 0 | 1,
    scenery: [],
  }));
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

  it("places streetlights every 6 segments outside tunnels", () => {
    const segments = roadWithScenery(42);
    for (const seg of segments) {
      const lights = seg.scenery.filter((o) => o.kind === "streetlight");
      if (seg.zone === "tunnel") {
        // Tunnel frames carry the warm lights instead.
        expect(lights.length).toBe(0);
      } else if (seg.index % 6 === 0) {
        expect(lights.length).toBe(1);
        if (seg.zone === "riverside") expect(lights[0]?.side).toBe("right");
      } else {
        expect(lights.length).toBe(0);
      }
    }
  });

  it("places guardrail support posts on both sides on the zone's cadence", () => {
    const segments = roadWithScenery(42);
    for (const seg of segments) {
      const rails = seg.scenery.filter((o) => o.kind === "guardrail");
      if (seg.zone === "tunnel" || seg.zone === "riverside") {
        const zoneIndices = segments
          .filter((candidate) => candidate.zone === seg.zone)
          .map((candidate) => candidate.index);
        const atBoundary = seg.index === zoneIndices[0] ||
          seg.index === zoneIndices[zoneIndices.length - 1];
        // The first/last zone segment keeps support posts while the
        // replacement scenery is still at zero fade.
        expect(rails.length > 0).toBe(atBoundary);
        continue;
      }
      const interval = seg.zone === "elevated" ? 8 : 4;
      if (seg.index % interval === 0) {
        expect(rails.filter((r) => r.side === "left").length).toBe(1);
        expect(rails.filter((r) => r.side === "right").length).toBe(1);
      } else {
        expect(rails.length).toBe(0);
      }
    }
  });

  it("generates buildings only on city and elevated segments, at most one per segment", () => {
    const segments = roadWithScenery(42);
    for (const seg of segments) {
      const buildings = seg.scenery.filter((o) => o.kind === "building");
      if (buildings.length > 0) {
        expect(seg.zone === "city" || seg.zone === "elevated").toBe(true);
      }
      expect(buildings.length).toBeLessThanOrEqual(1);
    }
  });

  it("gives elevated segments a low, sparse, far building layer", () => {
    const segments = roadWithScenery(42);
    let elevatedBuildings = 0;
    let cityBuildings = 0;
    for (const seg of segments) {
      for (const o of seg.scenery) {
        if (o.kind !== "building") continue;
        if (seg.zone === "elevated") {
          elevatedBuildings++;
          // Low layer: noticeably shorter than city towers (max 1800
          // vs. city's 1500–7900) and always the far silhouette color.
          expect(o.height).toBeLessThanOrEqual(1800);
          expect(o.colorVariant).toBe(1);
        } else if (seg.zone === "city") {
          cityBuildings++;
        }
      }
    }
    expect(elevatedBuildings).toBeGreaterThan(0);
    // Sparser than the city's towers, per segment.
    const elevatedSegs = segments.filter((s) => s.zone === "elevated").length;
    const citySegs = segments.filter((s) => s.zone === "city").length;
    expect(elevatedBuildings / elevatedSegs).toBeLessThan(
      cityBuildings / citySegs,
    );
  });

  it("keeps elevated buildings clear of the shoulder", () => {
    const segments = roadWithScenery(42);
    for (const seg of segments) {
      for (const o of seg.scenery) {
        if (o.kind !== "building" || seg.zone !== "elevated") continue;
        const innerEdge = o.offset - o.width / 2;
        expect(innerEdge).toBeGreaterThanOrEqual(SHOULDER_HALF_WIDTH + 100);
      }
    }
  });

  it("keeps building density balanced across sides", () => {
    const segments = roadWithScenery(42);
    let left = 0;
    let right = 0;
    for (const seg of segments) {
      for (const o of seg.scenery) {
        if (o.kind !== "building") continue;
        if (o.side === "left") left++;
        else right++;
      }
    }
    // The recipe now has two city blocks (~80 segments); ~0.55 chance
    // per attempted segment leaves a healthy sample without being huge.
    expect(left + right).toBeGreaterThan(20);
    expect(Math.abs(left - right) / (left + right)).toBeLessThan(0.35);
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
        expect(o.offset).toBeGreaterThan(gameConfig.roadHalfWidth);
      }
    }
  });

  it("keeps the widest building clear of the shoulder", () => {
    // Building inner edge = offset - width/2 must stay beyond the
    // shoulder, even at maximum width (plan §12.5: buildings must not
    // intrude on the road or shoulder).
    const segments = roadWithScenery(42);
    for (const seg of segments) {
      for (const o of seg.scenery) {
        if (o.kind !== "building") continue;
        const innerEdge = o.offset - o.width / 2;
        expect(innerEdge).toBeGreaterThanOrEqual(SHOULDER_HALF_WIDTH + 100);
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

  it("gives every tunnel segment exactly one tunnel-frame mask", () => {
    const segments = roadWithScenery(42);
    let tunnelSegs = 0;
    for (const seg of segments) {
      const frames = seg.scenery.filter((o) => o.kind === "tunnel-frame");
      if (seg.zone === "tunnel") {
        tunnelSegs++;
        expect(frames.length).toBe(1);
      } else {
        expect(frames.length).toBe(0);
      }
    }
    expect(tunnelSegs).toBeGreaterThan(0);
  });

  it("ramps tunnel entryDist/exitDist from the run boundaries", () => {
    const segments = roadWithScenery(42);
    const tunnelSegs = segments.filter((s) => s.zone === "tunnel");
    const runStart = tunnelSegs[0]?.index ?? 0;
    const runEnd = tunnelSegs[tunnelSegs.length - 1]?.index ?? 0;

    for (const seg of tunnelSegs) {
      const frame = seg.scenery.find((o) => o.kind === "tunnel-frame");
      if (!frame) throw new Error("missing tunnel-frame");
      expect(frame.entryDist).toBe(seg.index - runStart);
      expect(frame.exitDist).toBe(runEnd - seg.index);
    }
    // Both seams start at 0 (full light at the mouth) and the interior
    // sits comfortably past the fade distance.
    expect(tunnelSegs[0]?.scenery.find((o) => o.kind === "tunnel-frame")?.entryDist).toBe(0);
    expect(
      tunnelSegs[tunnelSegs.length - 1]?.scenery.find((o) => o.kind === "tunnel-frame")?.exitDist,
    ).toBe(0);
    const mid = tunnelSegs[Math.floor(tunnelSegs.length / 2)];
    const midFrame = mid?.scenery.find((o) => o.kind === "tunnel-frame");
    if (!midFrame) throw new Error("missing mid tunnel-frame");
    expect((midFrame.entryDist ?? 0) + (midFrame.exitDist ?? 0)).toBe(
      runEnd - runStart,
    );
    expect(midFrame.entryDist ?? 0).toBeGreaterThanOrEqual(20);
  });

  it("gives every riverside segment one river on the left bank", () => {
    const segments = roadWithScenery(42);
    let riverSegs = 0;
    for (const seg of segments) {
      const rivers = seg.scenery.filter((o) => o.kind === "river");
      if (seg.zone === "riverside") {
        riverSegs++;
        expect(rivers.length).toBe(1);
        expect(rivers[0]?.side).toBe("left");
        // The bank edge stays clear of the road shoulder.
        const innerEdge = (rivers[0]?.offset ?? 0) - (rivers[0]?.width ?? 0) / 2;
        expect(innerEdge).toBeGreaterThanOrEqual(SHOULDER_HALF_WIDTH);
      } else {
        expect(rivers.length).toBe(0);
      }
    }
    expect(riverSegs).toBeGreaterThan(0);
  });

  it("fades the river at the riverside run boundaries", () => {
    const segments = roadWithScenery(42);
    const riverSegs = segments.filter((s) => s.zone === "riverside");
    const runStart = riverSegs[0]?.index ?? 0;
    const runEnd = riverSegs[riverSegs.length - 1]?.index ?? 0;
    for (const seg of riverSegs) {
      const river = seg.scenery.find((o) => o.kind === "river");
      if (!river) throw new Error("missing river");
      expect(river.entryDist).toBe(seg.index - runStart);
      expect(river.exitDist).toBe(runEnd - seg.index);
    }
    expect(riverSegs[0]?.scenery.find((o) => o.kind === "river")?.entryDist).toBe(0);
    expect(
      riverSegs[riverSegs.length - 1]?.scenery.find((o) => o.kind === "river")?.exitDist,
    ).toBe(0);
  });

  it("places bridge silhouettes rarely and only in the riverside", () => {
    const segments = roadWithScenery(42);
    let bridges = 0;
    for (const seg of segments) {
      for (const o of seg.scenery) {
        if (o.kind !== "bridge") continue;
        bridges++;
        expect(seg.zone).toBe("riverside");
      }
    }
    // One or two bridges over the 40-segment riverside run at most.
    expect(bridges).toBeGreaterThan(0);
    expect(bridges).toBeLessThanOrEqual(2);
  });

  it("represents a wrapped zone run explicitly and keeps distances non-negative", () => {
    const segments = segmentsForZones([
      "tunnel", "tunnel", "city", "city", "tunnel", "tunnel",
    ]);
    const runs = findZoneRuns(segments, "tunnel");
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual({ start: 4, end: 1, wraps: true, length: 4 });

    const distances = [4, 5, 0, 1].map((index) => {
      const run = findRunForIndex(runs, index, segments.length);
      if (!run) throw new Error(`missing wrapped run for ${index}`);
      return getZoneRunDistances(run, index, segments.length);
    });
    expect(distances).toEqual([
      { entryDist: 0, exitDist: 3 },
      { entryDist: 1, exitDist: 2 },
      { entryDist: 2, exitDist: 1 },
      { entryDist: 3, exitDist: 0 },
    ]);
    for (const distance of distances) {
      expect(distance?.entryDist).toBeGreaterThanOrEqual(0);
      expect(distance?.exitDist).toBeGreaterThanOrEqual(0);
    }
  });

  it("generates wrapped tunnel and river scenery across the loop seam", () => {
    const tunnelSegments = segmentsForZones([
      "tunnel", "tunnel", "city", "city", "tunnel", "tunnel",
    ]);
    attachScenery(tunnelSegments, 42);
    const tunnelFrames = tunnelSegments
      .filter((seg) => seg.zone === "tunnel")
      .map((seg) => seg.scenery.find((obj) => obj.kind === "tunnel-frame"));
    expect(tunnelFrames.every((frame) => frame !== undefined)).toBe(true);
    expect(tunnelFrames.map((frame) => [frame?.entryDist, frame?.exitDist])).toEqual([
      [2, 1],
      [3, 0],
      [0, 3],
      [1, 2],
    ]);
    for (const frame of tunnelFrames) {
      expect(frame?.entryDist).toBeGreaterThanOrEqual(0);
      expect(frame?.exitDist).toBeGreaterThanOrEqual(0);
    }
    // The seam is continuous: the last array segment and the first array
    // segment are adjacent in the same circular run.
    const seamBefore = tunnelFrames[1];
    const seamAfter = tunnelFrames[2];
    if (!seamBefore || !seamAfter) throw new Error("missing wrapped tunnel seam");
    expect(tunnelFade(seamBefore)).toBeCloseTo(tunnelFade(seamAfter));

    const riverSegments = segmentsForZones([
      "riverside", "city", "city", "riverside",
    ]);
    attachScenery(riverSegments, 42);
    const rivers = riverSegments
      .filter((seg) => seg.zone === "riverside")
      .map((seg) => seg.scenery.find((obj) => obj.kind === "river"));
    expect(rivers.every((river) => river !== undefined)).toBe(true);
    expect(rivers.map((river) => [river?.entryDist, river?.exitDist])).toEqual([
      [1, 0],
      [0, 1],
    ]);
  });

  it("keeps riverside streetlights on the dry right bank", () => {
    const segments = segmentsForZones([
      "riverside", "riverside", "riverside", "riverside", "riverside", "riverside",
    ]);
    attachScenery(segments, 42);
    for (const seg of segments) {
      const light = seg.scenery.find((obj) => obj.kind === "streetlight");
      if (light) expect(light.side).toBe("right");
    }
  });
});

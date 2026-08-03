import { describe, it, expect } from "vitest";
import { projectSegmentsAhead, type ProjectInput } from "../render/projected-segment.ts";
import type { ProjectionParams } from "../render/projection.ts";
import { objectWorldX } from "../render/scenery-renderer.ts";
import { buildDefaultRoad, generateStraightRoad } from "../world/road-generator.ts";
import { getSegmentsAhead } from "../world/road-query.ts";
import { attachScenery } from "../world/scenery-generator.ts";
import { gameConfig } from "../config/game-config.ts";
import type { SceneryObject } from "../model/types.ts";

function makeParams(overrides: Partial<ProjectionParams> = {}): ProjectionParams {
  return {
    cameraX: 0,
    cameraY: 900,
    cameraZ: 10000,
    cameraDepth: 1,
    screenWidth: 1280,
    screenHeight: 720,
    roadHalfWidth: gameConfig.roadHalfWidth,
    ...overrides,
  };
}

function makeInput(overrides: Partial<ProjectInput> = {}): ProjectInput {
  return {
    offsetRate: 0,
    playerWorldX: 0,
    totalLength: 0,
    ...overrides,
  };
}

describe("projectSegmentsAhead — loop expansion", () => {
  it("expands wrapped segments so every segment lies at or ahead of the camera", () => {
    const road = buildDefaultRoad();
    const cameraZ = road.totalLength - 100; // near loop end
    const segments = road.segments.slice(0, 60); // simulate query results from wrap
    const projected = projectSegmentsAhead(
      segments,
      makeParams({ cameraZ }),
      makeInput({ totalLength: road.totalLength }),
    );
    expect(projected.length).toBe(60);
    for (const ps of projected) {
      expect(ps.zBase - cameraZ).toBeGreaterThanOrEqual(0);
      // Wrapped segments got the loop length added.
      if (ps.seg.p1.world.worldZ < cameraZ) {
        expect(ps.zBase).toBe(ps.seg.p1.world.worldZ + road.totalLength);
      }
    }
  });

  it("matches expandSegmentZ for unwrapped segments", () => {
    const road = buildDefaultRoad();
    const cameraZ = 5000;
    // Use the real query chain: getSegmentsAhead never returns segments
    // behind the camera, so their raw Z needs no expansion.
    const segments = getSegmentsAhead(road.segments, road.totalLength, cameraZ, 40);
    const projected = projectSegmentsAhead(
      segments,
      makeParams({ cameraZ }),
      makeInput({ totalLength: road.totalLength }),
    );
    for (const ps of projected) {
      expect(ps.zBase).toBe(ps.seg.p1.world.worldZ);
    }
  });
});

describe("projectSegmentsAhead — curve accumulation", () => {
  it("keeps a straight road centered (zero offset)", () => {
    const road = generateStraightRoad(50);
    const projected = projectSegmentsAhead(
      road.segments,
      makeParams(),
      makeInput({ totalLength: road.totalLength }),
    );
    for (const ps of projected) {
      expect(ps.centerOffsetNear).toBe(0);
      expect(ps.centerOffsetFar).toBe(0);
    }
  });

  it("accumulates lateral offset through a curve", () => {
    const curved = buildDefaultRoad();
    const projected = projectSegmentsAhead(
      curved.segments.slice(0, 120),
      makeParams({ cameraZ: 0 }),
      makeInput({ totalLength: curved.totalLength }),
    );
    // The recipe's first right turn must push the road center rightward.
    const check = projected[110];
    if (!check) throw new Error("missing projected segment");
    expect(check.centerOffsetFar).toBeGreaterThan(0);
  });

  it("is continuous between adjacent segments", () => {
    const road = buildDefaultRoad();
    const projected = projectSegmentsAhead(
      road.segments.slice(0, 200),
      makeParams({ cameraZ: 0 }),
      makeInput({ totalLength: road.totalLength }),
    );
    for (let i = 1; i < projected.length; i++) {
      const prev = projected[i - 1];
      const curr = projected[i];
      if (!prev || !curr) throw new Error("missing projected segment");
      expect(curr.centerOffsetNear).toBe(prev.centerOffsetFar);
    }
  });
});

describe("projectSegmentsAhead — shared scenery reference", () => {
  it("places scenery at road center + signed offset (pure function)", () => {
    const base: SceneryObject = {
      id: "s5-building-left",
      kind: "building",
      segmentIndex: 5,
      side: "left",
      offset: 2500,
      width: 1000,
      height: 3000,
      colorVariant: 0,
    };
    const leftObj: SceneryObject = { ...base };
    const rightObj: SceneryObject = { ...base, side: "right" };

    // Scenery world X = the segment's accumulated road center + the
    // object's signed lateral offset.
    expect(objectWorldX(120, leftObj)).toBe(120 - 2500);
    expect(objectWorldX(120, rightObj)).toBe(120 + 2500);
  });

  it("uses the loop-expanded zBase for scenery after wrapping", () => {
    const road = buildDefaultRoad();
    attachScenery(road.segments, 42);
    const cameraZ = road.totalLength - 100; // near loop end
    const segments = getSegmentsAhead(road.segments, road.totalLength, cameraZ, 30);
    const projected = projectSegmentsAhead(
      segments,
      makeParams({ cameraZ }),
      makeInput({ totalLength: road.totalLength }),
    );

    // At least one wrapped segment carries scenery; its expanded Z is
    // what the scenery renderer uses, never the raw (behind-camera) Z.
    const wrappedWithScenery = projected.find(
      (ps) => ps.seg.scenery.length > 0 && ps.seg.p1.world.worldZ < cameraZ,
    );
    if (!wrappedWithScenery) throw new Error("expected a wrapped scenery segment");
    expect(wrappedWithScenery.zBase).toBe(
      wrappedWithScenery.seg.p1.world.worldZ + road.totalLength,
    );
  });

  it("keeps every projected segment ahead of the camera", () => {
    const road = buildDefaultRoad();
    attachScenery(road.segments, 42);
    const cameraZ = road.totalLength - 4000;
    const projected = projectSegmentsAhead(
      road.segments.slice(0, 80),
      makeParams({ cameraZ }),
      makeInput({ totalLength: road.totalLength }),
    );
    for (const ps of projected) {
      expect(ps.zBase - cameraZ).toBeGreaterThanOrEqual(0);
    }
  });
});

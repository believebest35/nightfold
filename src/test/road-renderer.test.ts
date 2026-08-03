import { describe, it, expect } from "vitest";
import { guardrailRibbonGeometry } from "../render/road-renderer.ts";
import { projectWorldPoint, type ProjectionParams } from "../render/projection.ts";
import type { ProjectedSegment } from "../render/projected-segment.ts";
import type { RoadSegment } from "../model/types.ts";
import { gameConfig } from "../config/game-config.ts";

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

/** A one-segment road with the given start and end heights. */
function makeProjectedSegment(startY: number, endY: number): ProjectedSegment {
  const zBase = 10000;
  const zFar = zBase + gameConfig.segmentLength;
  const seg: RoadSegment = {
    index: 0,
    p1: { world: { worldX: 0, worldY: startY, worldZ: zBase } },
    p2: { world: { worldX: 0, worldY: endY, worldZ: zFar } },
    curve: 0,
    zone: "city",
    colorVariant: 0,
    scenery: [],
  };
  const params = makeParams();
  return {
    seg,
    zBase,
    centerOffsetNear: 0,
    centerOffsetFar: 0,
    near: projectWorldPoint(seg.p1.world, params),
    far: projectWorldPoint(seg.p2.world, params),
  };
}

describe("guardrailRibbonGeometry", () => {
  it("projects the far edge at the segment end height on an uphill segment", () => {
    const params = makeParams();
    const ps = makeProjectedSegment(0, 400); // p1.worldY !== p2.worldY
    const g = guardrailRibbonGeometry(ps, params, 1);
    const zFar = ps.zBase + gameConfig.segmentLength;
    // Screen Y depends only on worldY and worldZ (not worldX), so the
    // expected far-bottom Y is the end-height projection — not the
    // start-height one the old code used for both ends.
    const expected = projectWorldPoint({ worldX: 0, worldY: 400, worldZ: zFar }, params);
    expect(g.farBottom.y).toBe(expected.y);
  });

  it("projects the near edge at the segment start height", () => {
    const params = makeParams();
    const ps = makeProjectedSegment(0, 400);
    const g = guardrailRibbonGeometry(ps, params, -1);
    const expected = projectWorldPoint({ worldX: 0, worldY: 0, worldZ: ps.zBase }, params);
    expect(g.nearBottom.y).toBe(expected.y);
  });

  it("raises the far rail on uphill and lowers it on downhill segments", () => {
    const params = makeParams();
    const flat = guardrailRibbonGeometry(makeProjectedSegment(0, 0), params, 1);
    const uphill = guardrailRibbonGeometry(makeProjectedSegment(0, 400), params, 1);
    const downhill = guardrailRibbonGeometry(makeProjectedSegment(0, -400), params, 1);

    // Higher ground → smaller screen Y.
    expect(uphill.farBottom.y).toBeLessThan(flat.farBottom.y);
    expect(downhill.farBottom.y).toBeGreaterThan(flat.farBottom.y);
    // The near edge stays anchored to the start height in all cases.
    expect(uphill.nearBottom.y).toBe(flat.nearBottom.y);
    expect(downhill.nearBottom.y).toBe(flat.nearBottom.y);
  });
});

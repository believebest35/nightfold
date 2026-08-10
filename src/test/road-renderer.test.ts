import { describe, it, expect } from "vitest";
import {
  guardrailRibbonFace,
  guardrailRibbonGeometry,
  guardrailSideVisibility,
  guardrailSupportPostVisible,
} from "../render/road-renderer.ts";
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

describe("guardrailRibbonFace", () => {
  it("uses the same road-facing edge at the near and far ends", () => {
    const params = makeParams();
    const geometry = guardrailRibbonGeometry(makeProjectedSegment(0, 0), params, 1);
    const face = guardrailRibbonFace(geometry, 1, 0, params.screenHeight);

    expect(face).not.toBeNull();
    expect(face?.nearBottom.x).toBe(geometry.nearBottom.x - geometry.nearBottom.halfWidth);
    expect(face?.farBottom.x).toBe(geometry.farBottom.x - geometry.farBottom.halfWidth);
    expect(face?.nearTop.x).toBe(geometry.nearTop.x - geometry.nearTop.halfWidth);
    expect(face?.farTop.x).toBe(geometry.farTop.x - geometry.farTop.halfWidth);
  });

  it("mirrors the road-facing edge for the left and right rails", () => {
    const params = makeParams();
    const ps = makeProjectedSegment(0, 0);
    const leftGeometry = guardrailRibbonGeometry(ps, params, -1);
    const rightGeometry = guardrailRibbonGeometry(ps, params, 1);
    const left = guardrailRibbonFace(leftGeometry, -1, 0, params.screenHeight);
    const right = guardrailRibbonFace(rightGeometry, 1, 0, params.screenHeight);

    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect((left?.nearBottom.x ?? 0) + (right?.nearBottom.x ?? 0)).toBeCloseTo(params.screenWidth);
    expect((left?.farBottom.x ?? 0) + (right?.farBottom.x ?? 0)).toBeCloseTo(params.screenWidth);
  });

  it("keeps slope-aware Y projections while clipping the far bottom to the crest", () => {
    const params = makeParams();
    const geometry = guardrailRibbonGeometry(makeProjectedSegment(0, 400), params, -1);
    const clipTopY = geometry.farBottom.y + 5;
    const clipBottomY = geometry.nearBottom.y - 5;
    const face = guardrailRibbonFace(geometry, -1, clipTopY, clipBottomY);

    expect(face).not.toBeNull();
    expect(face?.farBottom.y).toBe(clipTopY);
    expect(face?.nearBottom.y).toBe(geometry.nearBottom.y);
    expect(face?.farTop.y).toBe(geometry.farTop.y);
  });
});

describe("guardrailSideVisibility", () => {
  it("keeps tunnel rails at the zero-fade mouth and removes them in the interior", () => {
    expect(guardrailSideVisibility("tunnel", 0, -1)).toBe(1);
    expect(guardrailSideVisibility("tunnel", 0, 1)).toBe(1);
    expect(guardrailSideVisibility("tunnel", 1, -1)).toBe(0);
    expect(guardrailSideVisibility("tunnel", 1, 1)).toBe(0);
  });

  it("fades only the river-side rail while retaining the dry-side rail", () => {
    expect(guardrailSideVisibility("riverside", 0, -1)).toBe(1);
    expect(guardrailSideVisibility("riverside", 0.5, -1)).toBe(0.5);
    expect(guardrailSideVisibility("riverside", 1, -1)).toBe(0);
    expect(guardrailSideVisibility("riverside", 1, 1)).toBe(1);
  });
});

describe("guardrail transition support posts", () => {
  it("keeps posts on the ribbon cadence and fades them with tunnel rails", () => {
    expect(guardrailSupportPostVisible("tunnel", 0, -1, 264)).toBe(true);
    expect(guardrailSupportPostVisible("tunnel", 0, 1, 264)).toBe(true);
    expect(guardrailSupportPostVisible("tunnel", 0, -1, 265)).toBe(false);
    expect(guardrailSupportPostVisible("tunnel", 1, -1, 264)).toBe(false);
    expect(guardrailSupportPostVisible("tunnel", 1, 1, 264)).toBe(false);
  });

  it("fades only river-side posts while dry-side posts stay on cadence", () => {
    expect(guardrailSupportPostVisible("riverside", 0.5, -1, 276)).toBe(true);
    expect(guardrailSupportPostVisible("riverside", 1, -1, 276)).toBe(false);
    expect(guardrailSupportPostVisible("riverside", 1, 1, 276)).toBe(true);
    expect(guardrailSupportPostVisible("riverside", 0.5, -1, 277)).toBe(false);
  });
});

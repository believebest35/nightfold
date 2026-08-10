import { describe, expect, it } from "vitest";
import { gameConfig } from "../config/game-config.ts";
import type { RoadSegment, RenderContext } from "../model/types.ts";
import { renderFrame, type RenderState } from "../render/renderer.ts";
import { projectCurrentSegment, projectSegmentsAhead } from "../render/projected-segment.ts";
import { computeCameraDepth } from "../render/projection.ts";
import { fogFactor, mixWithFog, parseHex } from "../render/fog.ts";
import { palette } from "../config/palette.ts";
import {
  tunnelApertureGeometry,
  tunnelEnvironmentFade,
  tunnelPortalGeometry,
} from "../render/scenery-renderer.ts";
import type { SkyRenderer } from "../render/sky-renderer.ts";

interface RecordingCanvas {
  ctx: CanvasRenderingContext2D;
  fillRects: Array<[number, number, number, number]>;
  fillRectStyles: Array<{ rect: [number, number, number, number]; fillStyle: unknown }>;
  fills: Array<{ fillStyle: unknown; globalAlpha: number }>;
  filledPaths: Array<{ points: Array<[number, number]>; fillStyle: unknown }>;
  strokedPaths: Array<{ points: Array<[number, number]>; strokeStyle: unknown }>;
  events: string[];
  clipCount: number;
}

function makeRecordingCanvas(): RecordingCanvas {
  const fillRects: Array<[number, number, number, number]> = [];
  const fillRectStyles: Array<{ rect: [number, number, number, number]; fillStyle: unknown }> = [];
  const fills: Array<{ fillStyle: unknown; globalAlpha: number }> = [];
  const filledPaths: Array<{ points: Array<[number, number]>; fillStyle: unknown }> = [];
  const strokedPaths: Array<{ points: Array<[number, number]>; strokeStyle: unknown }> = [];
  const events: string[] = [];
  let currentPath: Array<[number, number]> = [];
  let clipCount = 0;
  const gradient = { addColorStop: () => undefined } as unknown as CanvasGradient;
  const styleText = (style: unknown): string =>
    typeof style === "string" ? style : "non-string-style";
  const context = {
    fillRects,
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    globalAlpha: 1,
    save: () => undefined,
    restore: () => undefined,
    scale: () => undefined,
    createLinearGradient: () => gradient,
    fillRect: (x: number, y: number, width: number, height: number) => {
      const rect: [number, number, number, number] = [x, y, width, height];
      fillRects.push(rect);
      fillRectStyles.push({ rect, fillStyle: context.fillStyle });
      events.push(`rect:${styleText(context.fillStyle)}`);
    },
    beginPath: () => {
      currentPath = [];
    },
    closePath: () => undefined,
    moveTo: (x: number, y: number) => {
      currentPath.push([x, y]);
    },
    lineTo: (x: number, y: number) => {
      currentPath.push([x, y]);
    },
    fill: () => {
      fills.push({ fillStyle: context.fillStyle, globalAlpha: context.globalAlpha });
      filledPaths.push({ points: [...currentPath], fillStyle: context.fillStyle });
      events.push(`fill:${styleText(context.fillStyle)}`);
    },
    stroke: () => {
      strokedPaths.push({ points: [...currentPath], strokeStyle: context.strokeStyle });
      events.push(`stroke:${styleText(context.strokeStyle)}`);
    },
    arc: () => undefined,
    roundRect: () => undefined,
    clip: () => {
      clipCount++;
    },
  } as unknown as CanvasRenderingContext2D & { fillRects: typeof fillRects };
  return {
    ctx: context,
    fillRects,
    fillRectStyles,
    fills,
    filledPaths,
    strokedPaths,
    events,
    get clipCount() {
      return clipCount;
    },
  };
}

function tunnelSegments(count: number): RoadSegment[] {
  return Array.from({ length: count }, (_, index) => ({
    index,
    p1: {
      world: {
        worldX: 0,
        worldY: 0,
        worldZ: (index + 1) * gameConfig.segmentLength,
      },
    },
    p2: {
      world: {
        worldX: 0,
        worldY: 0,
        worldZ: (index + 2) * gameConfig.segmentLength,
      },
    },
    curve: 0,
    zone: "tunnel" as const,
    colorVariant: (index % 2) as 0 | 1,
    scenery: [{
      id: `s${index}-tunnel-frame`,
      kind: "tunnel-frame" as const,
      segmentIndex: index,
      side: "left" as const,
      offset: gameConfig.roadHalfWidth * 1.5,
      width: 400,
      height: 2600,
      colorVariant: 0,
      entryDist: 20,
      exitDist: 20,
    }],
  }));
}

function projectedTunnelPair(playerX = 0) {
  const params = {
    cameraX: playerX * gameConfig.roadHalfWidth,
    cameraY: gameConfig.cameraHeight,
    cameraZ: 0,
    cameraDepth: computeCameraDepth(gameConfig.cameraFovDegrees),
    screenWidth: 320,
    screenHeight: 180,
    roadHalfWidth: gameConfig.roadHalfWidth,
  };
  const projected = projectSegmentsAhead(
    tunnelSegments(4),
    params,
    {
      offsetRate: 0,
      playerWorldX: playerX * gameConfig.roadHalfWidth,
      totalLength: 100000,
    },
  );
  const nearSegment = projected[0];
  const farSegment = projected[projected.length - 1];
  if (!nearSegment || !farSegment) throw new Error("missing projected tunnel pair");
  return { params, nearSegment, farSegment };
}

function makeRenderContext(canvas: RecordingCanvas): RenderContext {
  return {
    ctx: canvas.ctx,
    width: 320,
    height: 180,
    dpr: 1,
  };
}

function makeState(overrides: Partial<RenderState> = {}): RenderState {
  return {
    cameraY: gameConfig.cameraHeight,
    cameraZ: 0,
    cameraZone: "tunnel",
    cameraZoneEntryDist: 20,
    cameraZoneExitDist: 20,
    cameraSegmentProgress: 0.5,
    playerX: 0,
    roadOffsetRate: 0,
    totalLength: 100000,
    distanceTravelled: 0,
    debug: false,
    ...overrides,
  };
}

const silentSky = { render: () => undefined } as unknown as SkyRenderer;

function countFullScreenMasks(canvas: RecordingCanvas): number {
  return canvas.fills.filter(({ fillStyle }) =>
    typeof fillStyle === "string" && fillStyle.startsWith("rgba(0,0,0,"),
  ).length;
}

describe("frame-level tunnel environment", () => {
  it("draws at most one full-screen environment mask for many tunnel segments", () => {
    const canvas = makeRecordingCanvas();
    renderFrame(
      canvas.ctx,
      makeRenderContext(canvas),
      tunnelSegments(24),
      makeState(),
      silentSky,
    );

    expect(countFullScreenMasks(canvas)).toBe(1);
  });

  it("does not darken the whole frame when the camera is outside the tunnel", () => {
    const canvas = makeRecordingCanvas();
    renderFrame(
      canvas.ctx,
      makeRenderContext(canvas),
      tunnelSegments(24),
      makeState({
        cameraZone: "elevated",
        cameraZoneEntryDist: undefined,
        cameraZoneExitDist: undefined,
      }),
      silentSky,
    );

    expect(countFullScreenMasks(canvas)).toBe(0);
  });

  it("uses continuous camera position for tunnel entry and exit fades", () => {
    expect(tunnelEnvironmentFade("elevated", 20, 20, 0.5)).toBe(0);
    expect(tunnelEnvironmentFade("tunnel", 0, 40, 0)).toBe(0);
    expect(tunnelEnvironmentFade("tunnel", 20, 20, 0.5)).toBe(1);
    expect(tunnelEnvironmentFade("tunnel", 40, 0, 1)).toBe(0);
  });

  it("derives the aperture from projected roof and road points", () => {
    const centered = projectedTunnelPair(0);
    const shiftedLeft = projectedTunnelPair(-0.8);
    const shifted = projectedTunnelPair(0.8);
    const centeredAperture = tunnelApertureGeometry(
      centered.params,
      centered.nearSegment,
      centered.farSegment,
    );
    const shiftedAperture = tunnelApertureGeometry(
      shifted.params,
      shifted.nearSegment,
      shifted.farSegment,
    );
    const shiftedLeftAperture = tunnelApertureGeometry(
      shiftedLeft.params,
      shiftedLeft.nearSegment,
      shiftedLeft.farSegment,
    );

    expect(shiftedLeftAperture.centerX).not.toBeCloseTo(centeredAperture.centerX);
    expect(shiftedAperture.centerX).not.toBeCloseTo(centeredAperture.centerX);
    expect(shiftedAperture.roofNearLeft.x).not.toBeCloseTo(centeredAperture.roofNearLeft.x);
    expect(shiftedAperture.roofNearRight.x).not.toBeCloseTo(centeredAperture.roofNearRight.x);
    // Perspective makes the roof edge converge toward the far portal; it is
    // not a viewport-fixed horizontal divider.
    expect(Math.abs(centeredAperture.roofNearLeft.y - centeredAperture.roofFarLeft.y))
      .toBeGreaterThan(0.1);
    expect(centeredAperture.bottomY).toBe(180);
  });

  it("uses one projected roof surface and leaves the far portal interior open", () => {
    const canvas = makeRecordingCanvas();
    renderFrame(
      canvas.ctx,
      makeRenderContext(canvas),
      tunnelSegments(24),
      makeState(),
      silentSky,
    );

    const roofFills = canvas.filledPaths.filter(({ fillStyle }) =>
      typeof fillStyle === "string" && fillStyle.startsWith("rgba(8,11,20,0.86"),
    );
    expect(roofFills).toHaveLength(1);
    expect(canvas.filledPaths.some(({ fillStyle }) =>
      typeof fillStyle === "string" && fillStyle.startsWith("rgba(8,11,20,0.84"),
    )).toBe(false);
    expect(roofFills[0]?.points).toHaveLength(4);
    expect(new Set(roofFills[0]?.points.map(([, y]) => y)).size).toBeGreaterThan(1);
  });

  it("does not paint tunnel environment geometry when the camera is elevated", () => {
    const canvas = makeRecordingCanvas();
    renderFrame(
      canvas.ctx,
      makeRenderContext(canvas),
      tunnelSegments(24),
      makeState({
        cameraZone: "elevated",
        cameraZoneEntryDist: undefined,
        cameraZoneExitDist: undefined,
      }),
      silentSky,
    );

    expect(countFullScreenMasks(canvas)).toBe(0);
    expect(canvas.filledPaths.filter(({ fillStyle }) =>
      typeof fillStyle === "string" && fillStyle.startsWith("rgba(8,11,20,"),
    )).toHaveLength(0);
  });

  it("keeps a later tunnel run's frame and lamp in the normal painter pass", () => {
    const canvas = makeRecordingCanvas();
    const segments = tunnelSegments(7).map((segment, index) => ({
      ...segment,
      zone: index >= 2 && index <= 5 ? "city" as const : "tunnel" as const,
      scenery: index >= 2 && index <= 5 ? [] : segment.scenery,
    }));
    renderFrame(
      canvas.ctx,
      makeRenderContext(canvas),
      segments,
      makeState({ cameraZ: -1000 }),
      silentSky,
    );

    const lampRects = canvas.fillRectStyles.filter(({ fillStyle }) =>
      typeof fillStyle === "string" && fillStyle.startsWith("rgba(240,184,90,"),
    );
    // One lamp comes from the current-run post-mask pass (segment 0), and
    // one from the later run's ordinary far-to-near pass (segment 6).
    expect(lampRects).toHaveLength(2);
  });

  it("clips the inside detail pass to the current tunnel run", () => {
    const canvas = makeRecordingCanvas();
    const mixed = tunnelSegments(4).map((segment, index) => ({
      ...segment,
      zone: index === 2 ? "city" as const : "tunnel" as const,
      scenery: index === 2 ? [] : segment.scenery,
    }));
    renderFrame(
      canvas.ctx,
      makeRenderContext(canvas),
      mixed,
      makeState({ cameraZ: -1000 }),
      silentSky,
    );
    // The near-to-far projected list is tunnel, tunnel, city, tunnel. Only
    // the contiguous run ahead of the camera may be redrawn above the mask.
    expect(canvas.clipCount).toBe(2);
  });

  it("keeps an aperture when the camera is in the last tunnel segment", () => {
    const canvas = makeRecordingCanvas();
    const current = tunnelSegments(1)[0];
    if (!current) throw new Error("missing current tunnel segment");
    const currentFrame = current.scenery[0];
    if (!currentFrame) throw new Error("missing tunnel frame");
    current.scenery[0] = { ...currentFrame, entryDist: 8, exitDist: 0 };
    renderFrame(
      canvas.ctx,
      makeRenderContext(canvas),
      [],
      makeState({
        cameraZ: current.p1.world.worldZ + 40,
        cameraSegmentProgress: 0.2,
        cameraZoneEntryDist: 8,
        cameraZoneExitDist: 0,
        currentSegment: current,
      }),
      silentSky,
    );

    // renderFrame is intentionally void; the road pass records the same
    // geometry through the environment's roof fill and exit portal.
    expect(canvas.filledPaths.some(({ fillStyle }) =>
      typeof fillStyle === "string" && fillStyle.startsWith("rgba(8,11,20,"),
    )).toBe(true);
  });

  it("keeps fade continuous from segment 342 through the exit segment", () => {
    const at342End = tunnelEnvironmentFade("tunnel", 78, 1, 1);
    const at343Start = tunnelEnvironmentFade("tunnel", 79, 0, 0);
    const at343End = tunnelEnvironmentFade("tunnel", 79, 0, 1);
    const at344Start = tunnelEnvironmentFade("riverside", undefined, undefined, 0);
    expect(at342End).toBeCloseTo(at343Start);
    expect(at343Start).toBeGreaterThan(0);
    expect(at343End).toBe(0);
    expect(at344Start).toBe(0);
  });

  it("projects a valid near and far section for a single tunnel segment", () => {
    const segment = tunnelSegments(1)[0];
    if (!segment) throw new Error("missing tunnel segment");
    segment.p2.world.worldY = 400;
    const params = projectedTunnelPair().params;
    const current = projectCurrentSegment(segment, params, {
      offsetRate: 0,
      playerWorldX: 0,
      totalLength: 100000,
    }, 0.5);
    const aperture = tunnelApertureGeometry(params, current, current);
    expect(aperture.nearSegmentIndex).toBe(segment.index);
    expect(aperture.farSegmentIndex).toBe(segment.index);
    expect(aperture.nearProgress).toBe(0.5);
    expect(aperture.roofNearLeft.y).toBeLessThan(aperture.roadNearLeft.y);
    expect(aperture.roofFarLeft.y).toBeLessThan(aperture.roadFarLeft.y);
  });

  it("moves the aperture near section with camera progress", () => {
    const segment = tunnelSegments(1)[0];
    if (!segment) throw new Error("missing tunnel segment");
    segment.p2.world.worldY = 400;
    const params = projectedTunnelPair().params;
    const input = { offsetRate: 0, playerWorldX: 0, totalLength: 100000 };
    const early = projectCurrentSegment(segment, params, input, 0.1);
    const late = projectCurrentSegment(segment, params, input, 0.9);
    const earlyAperture = tunnelApertureGeometry(params, early, early);
    const lateAperture = tunnelApertureGeometry(params, late, late);
    expect(earlyAperture.nearProgress).toBe(0.1);
    expect(lateAperture.nearProgress).toBe(0.9);
    expect(earlyAperture.roofNearLeft.y).not.toBeCloseTo(lateAperture.roofNearLeft.y);
  });

  it("anchors entrance and exit portals to opposite run boundaries", () => {
    const [segment] = tunnelSegments(2);
    if (!segment) throw new Error("missing tunnel segment");
    const params = projectedTunnelPair().params;
    const projected = projectSegmentsAhead(
      tunnelSegments(2),
      params,
      { offsetRate: 0, playerWorldX: 0, totalLength: 100000 },
    );
    const near = projected[0];
    const far = projected[1];
    if (!near || !far) throw new Error("missing projected run");
    const entrance = tunnelPortalGeometry(near, params, true);
    const exit = tunnelPortalGeometry(far, params, false);
    const aperture = tunnelApertureGeometry(params, near, far);
    expect(entrance.roofLeft).toEqual(aperture.roofNearLeft);
    expect(entrance.roofRight).toEqual(aperture.roofNearRight);
    expect(exit.roofLeft).toEqual(aperture.roofFarLeft);
    expect(exit.roofRight).toEqual(aperture.roofFarRight);
    expect(segment.index).toBe(0);
  });

  it("does not enter the post-mask detail pass while outside the tunnel", () => {
    const canvas = makeRecordingCanvas();
    renderFrame(
      canvas.ctx,
      makeRenderContext(canvas),
      tunnelSegments(8),
      makeState({
        cameraZone: "elevated",
        cameraZoneEntryDist: undefined,
        cameraZoneExitDist: undefined,
        currentSegment: undefined,
      }),
      silentSky,
    );
    expect(canvas.clipCount).toBe(0);
  });

  it("draws a portal with a beam and two supported side posts", () => {
    const canvas = makeRecordingCanvas();
    const segment = tunnelSegments(1)[0];
    if (!segment) throw new Error("missing tunnel segment");
    const frame = segment.scenery[0];
    if (!frame) throw new Error("missing tunnel frame");
    segment.scenery[0] = { ...frame, entryDist: 0, exitDist: 4 };
    renderFrame(
      canvas.ctx,
      makeRenderContext(canvas),
      [segment],
      makeState({
        cameraZ: -900,
        cameraZone: "elevated",
        cameraZoneEntryDist: undefined,
        cameraZoneExitDist: undefined,
        currentSegment: undefined,
      }),
      silentSky,
    );
    const portalPath = canvas.strokedPaths.find(({ points }) => points.length === 6);
    expect(portalPath).toBeDefined();
    expect(portalPath?.points[0]).toEqual(portalPath?.points[2]);
    expect(portalPath?.points[1]).toEqual(portalPath?.points[4]);
  });

  it("keeps a farther tunnel rib behind nearer non-tunnel scenery", () => {
    const canvas = makeRecordingCanvas();
    const baseSegments = tunnelSegments(7);
    const segments = baseSegments.map((segment, index) => {
      if (index < 2 || index === 6) return segment;
      if (index !== 5) return { ...segment, zone: "city" as const, scenery: [] };
      return {
        ...segment,
        zone: "city" as const,
        scenery: [{
          id: "near-city-building",
          kind: "building" as const,
          segmentIndex: index,
          side: "left" as const,
          offset: 3500,
          width: 1600,
          height: 5000,
          colorVariant: 0,
        }],
      };
    });
    renderFrame(
      canvas.ctx,
      makeRenderContext(canvas),
      segments,
      makeState({ cameraZ: -1000 }),
      silentSky,
    );
    const expectedBuildingFill = mixWithFog(parseHex(palette.buildingNear), fogFactor(2200));
    const ribLampIndex = canvas.events.findIndex((event) =>
      event === "rect:rgba(240,184,90,0.9)",
    );
    const buildingIndex = canvas.events.findIndex((event) =>
      event === `fill:${expectedBuildingFill}`,
    );
    expect(ribLampIndex).toBeGreaterThanOrEqual(0);
    expect(buildingIndex).toBeGreaterThan(ribLampIndex);
  });

  it("does not invent entrance or exit portals for an all-tunnel loop", () => {
    const canvas = makeRecordingCanvas();
    const loop = tunnelSegments(8).map((segment) => {
      const frame = segment.scenery[0];
      if (!frame) throw new Error("missing all-loop frame");
      return {
        ...segment,
        scenery: [{ ...frame, closedRun: true }],
      };
    });
    const current = loop[0];
    if (!current) throw new Error("missing current all-loop segment");
    renderFrame(
      canvas.ctx,
      makeRenderContext(canvas),
      loop.slice(1),
      makeState({
        cameraZ: current.p1.world.worldZ,
        currentSegment: current,
      }),
      silentSky,
    );
    expect(canvas.filledPaths.some(({ fillStyle }) =>
      typeof fillStyle === "string" && fillStyle.startsWith("rgba(8,11,20,0.72"),
    )).toBe(false);
  });
});

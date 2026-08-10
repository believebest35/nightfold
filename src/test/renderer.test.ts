import { describe, expect, it } from "vitest";
import { gameConfig } from "../config/game-config.ts";
import type { RoadSegment, RenderContext } from "../model/types.ts";
import { renderFrame, type RenderState } from "../render/renderer.ts";
import { projectSegmentsAhead } from "../render/projected-segment.ts";
import { computeCameraDepth } from "../render/projection.ts";
import {
  tunnelApertureGeometry,
  tunnelEnvironmentFade,
} from "../render/scenery-renderer.ts";
import type { SkyRenderer } from "../render/sky-renderer.ts";

interface RecordingCanvas {
  ctx: CanvasRenderingContext2D;
  fillRects: Array<[number, number, number, number]>;
  fillRectStyles: Array<{ rect: [number, number, number, number]; fillStyle: unknown }>;
  fills: Array<{ fillStyle: unknown; globalAlpha: number }>;
  filledPaths: Array<{ points: Array<[number, number]>; fillStyle: unknown }>;
  clipCount: number;
}

function makeRecordingCanvas(): RecordingCanvas {
  const fillRects: Array<[number, number, number, number]> = [];
  const fillRectStyles: Array<{ rect: [number, number, number, number]; fillStyle: unknown }> = [];
  const fills: Array<{ fillStyle: unknown; globalAlpha: number }> = [];
  const filledPaths: Array<{ points: Array<[number, number]>; fillStyle: unknown }> = [];
  let currentPath: Array<[number, number]> = [];
  let clipCount = 0;
  const gradient = { addColorStop: () => undefined } as unknown as CanvasGradient;
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
    },
    stroke: () => undefined,
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

  it("uses one projected roof and portal surface for the whole current run", () => {
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
    const portalFills = canvas.filledPaths.filter(({ fillStyle }) =>
      typeof fillStyle === "string" && fillStyle.startsWith("rgba(8,11,20,0.84"),
    );
    expect(roofFills).toHaveLength(1);
    expect(portalFills).toHaveLength(1);
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
});

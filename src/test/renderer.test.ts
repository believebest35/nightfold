import { describe, expect, it } from "vitest";
import { gameConfig } from "../config/game-config.ts";
import type { RoadSegment, RenderContext } from "../model/types.ts";
import { renderFrame, type RenderState } from "../render/renderer.ts";
import { tunnelEnvironmentFade } from "../render/scenery-renderer.ts";
import type { SkyRenderer } from "../render/sky-renderer.ts";

interface RecordingCanvas {
  ctx: CanvasRenderingContext2D;
  fillRects: Array<[number, number, number, number]>;
}

function makeRecordingCanvas(): RecordingCanvas {
  const fillRects: Array<[number, number, number, number]> = [];
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
      fillRects.push([x, y, width, height]);
    },
    beginPath: () => undefined,
    closePath: () => undefined,
    moveTo: () => undefined,
    lineTo: () => undefined,
    fill: () => undefined,
    stroke: () => undefined,
    arc: () => undefined,
    roundRect: () => undefined,
  } as unknown as CanvasRenderingContext2D & { fillRects: typeof fillRects };
  return { ctx: context, fillRects };
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
  return canvas.fillRects.filter(([x, y, width, height]) =>
    x === 0 && y === 0 && width === 320 && height === 180,
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
});

import type { RoadSegment, RenderContext } from "../model/types.ts";
import {
  computeCameraDepth,
  type ProjectionParams,
} from "./projection.ts";
import { renderRoad } from "./road-renderer.ts";
import { gameConfig } from "../config/game-config.ts";
import { palette } from "../config/palette.ts";

export interface RenderState {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  debug: boolean;
}

/**
 * Main renderer — orchestrates the per-frame draw order:
 * 1. Sky gradient
 * 2. Ground / grass
 * 3. Road segments (far to near)
 * 4. Debug overlay is handled by Game directly
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  renderCtx: RenderContext,
  segments: RoadSegment[],
  state: RenderState,
): void {
  const { width, height, dpr } = renderCtx;

  ctx.save();
  ctx.scale(dpr, dpr);

  // 1. Sky gradient
  drawSkyGradient(ctx, width, height);

  // 2. Ground below road
  drawGround(ctx, width, height);

  // 3. Road
  const cameraDepth = computeCameraDepth(gameConfig.cameraFovDegrees);
  const projParams: ProjectionParams = {
    cameraX: state.cameraX,
    cameraY: state.cameraY,
    cameraZ: state.cameraZ,
    cameraDepth,
    screenWidth: width,
    screenHeight: height,
    roadHalfWidth: gameConfig.roadHalfWidth,
  };

  renderRoad(ctx, segments, projParams, renderCtx, state.debug);

  ctx.restore();
}

function drawSkyGradient(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, palette.skyTop);
  gradient.addColorStop(0.5, palette.skyBottom);
  gradient.addColorStop(1, palette.fog);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawGround(ctx: CanvasRenderingContext2D, width: number, _height: number): void {
  // Ground fill below center — acts as the base before road overlay.
  // The road will be drawn on top of this. Use a dark muted tone.
  const groundGrad = ctx.createLinearGradient(0, _height * 0.4, 0, _height);
  groundGrad.addColorStop(0, "#111521");
  groundGrad.addColorStop(1, "#0a0d14");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, _height * 0.4, width, _height * 0.6);
}

import type { RoadSegment, RenderContext } from "../model/types.ts";
import {
  computeCameraDepth,
  type ProjectionParams,
} from "./projection.ts";
import { projectSegmentsAhead, type ProjectInput } from "./projected-segment.ts";
import { createRoadClipState, renderRoadSegment } from "./road-renderer.ts";
import { renderSceneryForSegment } from "./scenery-renderer.ts";
import { renderVehicle } from "./vehicle-renderer.ts";
import { SkyRenderer } from "./sky-renderer.ts";
import { gameConfig } from "../config/game-config.ts";
import { palette } from "../config/palette.ts";

export interface RenderState {
  cameraY: number;
  cameraZ: number;
  /** Normalized player lateral position, road edges at ±1. */
  playerX: number;
  /** Road direction derivative at the camera (dx), for curve rendering. */
  roadOffsetRate: number;
  /** Total loop length, for wrapped Z expansion. */
  totalLength: number;
  /** Monotonically increasing distance, drives background parallax. */
  distanceTravelled: number;
  debug: boolean;
}

/**
 * Main renderer — orchestrates the per-frame draw order (plan §10.3):
 * 1. Sky gradient + mountains + skyline + horizon haze
 * 2. Ground fill below the horizon
 * 3. Road + scenery, one shared far → near pass: each segment draws
 *    its road trapezoids first, then its scenery, so a near building
 *    correctly occludes a farther road edge and the clip state (hill
 *    crests) applies across both.
 * 4. Player vehicle anchor
 *
 * NOTE: The DPR transform is owned exclusively by Game.render().
 * This function must NOT scale the context — doing so would compound
 * the DPR factor (dpr²) and push the scene off-canvas at DPR > 1.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  renderCtx: RenderContext,
  segments: RoadSegment[],
  state: RenderState,
  sky: SkyRenderer,
): void {
  const { width, height } = renderCtx;

  // 1. Sky, mountains, skyline, horizon haze (parallax from distance).
  sky.render(ctx, width, height, state.distanceTravelled);

  // 2. Ground below the horizon
  drawGround(ctx, width, height);

  // 3. Road + scenery in one far → near pass.
  const cameraDepth = computeCameraDepth(gameConfig.cameraFovDegrees);
  const projParams: ProjectionParams = {
    cameraX: state.playerX * gameConfig.roadHalfWidth,
    cameraY: state.cameraY,
    cameraZ: state.cameraZ,
    cameraDepth,
    screenWidth: width,
    screenHeight: height,
    roadHalfWidth: gameConfig.roadHalfWidth,
  };
  const projInput: ProjectInput = {
    offsetRate: state.roadOffsetRate,
    playerWorldX: state.playerX * gameConfig.roadHalfWidth,
    totalLength: state.totalLength,
  };

  const projected = projectSegmentsAhead(segments, projParams, projInput);
  const clip = createRoadClipState();
  for (let i = projected.length - 1; i >= 0; i--) {
    const ps = projected[i];
    if (!ps) continue;
    // The road pass reports the segment's visibility and clip band;
    // scenery only draws for visible segments and truncates object
    // bases at the hill crest (no ground-level objects through terrain).
    const vis = renderRoadSegment(ctx, ps, projParams, state.debug, clip);
    if (vis.visible) {
      renderSceneryForSegment(ctx, ps, projParams, vis.clipTopY);
    }
  }

  // 4. Player vehicle anchor
  renderVehicle(ctx, width, height, state.playerX);
}

function drawGround(ctx: CanvasRenderingContext2D, width: number, height: number): void {
  // Ground fill below the horizon — base layer under the road.
  const groundGrad = ctx.createLinearGradient(0, height * 0.4, 0, height);
  groundGrad.addColorStop(0, palette.buildingNear);
  groundGrad.addColorStop(1, palette.groundBottom);
  ctx.fillStyle = groundGrad;
  ctx.fillRect(0, height * 0.4, width, height * 0.6);
}

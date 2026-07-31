import type { RoadSegment, RenderContext } from "../model/types.ts";
import {
  computeCameraDepth,
  type ProjectionParams,
} from "./projection.ts";
import { renderRoad } from "./road-renderer.ts";
import { renderScenery } from "./scenery-renderer.ts";
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
  debug: boolean;
}

/**
 * Main renderer — orchestrates the per-frame draw order (plan §10.3):
 * 1. Sky gradient + mountains + skyline + horizon haze
 * 2. Ground fill below the horizon
 * 3. Road segments (far to near)
 * 4. Scenery bound to segments (far to near)
 * 5. Player vehicle anchor
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

  // 1. Sky, mountains, skyline, horizon haze
  sky.render(ctx, width, height, state.cameraZ);

  // 2. Ground below the horizon
  drawGround(ctx, width, height);

  // 3. Road
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

  renderRoad(
    ctx,
    segments,
    projParams,
    renderCtx,
    state.debug,
    {
      offsetRate: state.roadOffsetRate,
      playerWorldX: state.playerX * gameConfig.roadHalfWidth,
      totalLength: state.totalLength,
    },
  );

  // 4. Scenery bound to the road segments
  renderScenery(ctx, segments, projParams);

  // 5. Player vehicle anchor
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

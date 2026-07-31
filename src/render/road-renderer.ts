import type { RoadSegment, RenderContext } from "../model/types.ts";
import { projectWorldPoint, type ProjectionParams } from "./projection.ts";
import { expandSegmentZ } from "../world/road-query.ts";
import { gameConfig } from "../config/game-config.ts";
import { palette } from "../config/palette.ts";

const SHOULDER_WIDTH_FACTOR = 1.4;
const EDGE_LINE_WIDTH_FACTOR = 0.05;
const CENTER_LINE_WIDTH_FACTOR = 0.015;
const LANE_MARKER_WIDTH_FACTOR = 0.05;

interface RoadDrawState {
  /** Highest screen Y drawn so far (lowest on screen). Used for clipY occlusion. */
  maxY: number;
}

export interface RoadRenderInput {
  /** Running lateral offset derivative (dx) at the camera position. */
  offsetRate: number;
  /** Player lateral position in world units (playerX * roadHalfWidth). */
  playerWorldX: number;
  /** Total loop length, used to expand wrapped segment Z coordinates. */
  totalLength: number;
}

/**
 * Draw road segments from far to near, generating perspective trapezoids.
 *
 * Curvature follows the plan (§7.3): maintain x (lateral offset) and dx
 * (offset derivative), advancing per segment:
 *   x += dx; dx += segment.curve
 * The near edge of a segment uses the previous segment's far offset,
 * so curves sweep continuously instead of kinking.
 */
export function renderRoad(
  ctx: CanvasRenderingContext2D,
  segments: RoadSegment[],
  params: ProjectionParams,
  _renderCtx: RenderContext,
  debug: boolean,
  input: RoadRenderInput,
): void {
  if (segments.length === 0) return;

  const projParams: ProjectionParams = {
    ...params,
    cameraX: input.playerWorldX,
  };

  const screenHeight = params.screenHeight;

  // Curvature accumulation (authoritative here — the only place curves
  // are integrated for rendering).
  let x = 0;
  let dx = input.offsetRate;
  let prevX = 0;

  const projected = segments.map((seg) => {
    x += dx;
    dx += seg.curve;

    const zBase = expandSegmentZ(seg, input.totalLength, params.cameraZ);
    const zFar = zBase + gameConfig.segmentLength;

    const near = projectWorldPoint(
      { worldX: prevX, worldY: seg.p1.world.worldY, worldZ: zBase },
      projParams,
    );
    const far = projectWorldPoint(
      { worldX: x, worldY: seg.p2.world.worldY, worldZ: zFar },
      projParams,
    );
    prevX = x;

    return { seg, near, far };
  });

  const state: RoadDrawState = { maxY: 0 };

  for (let i = projected.length - 1; i >= 0; i--) {
    const item = projected[i];
    if (!item) continue;

    const { seg, far, near } = item;

    // Skip segments entirely above or below the screen.
    if (far.y < 0 && near.y < 0) continue;
    if (far.y > screenHeight && near.y > screenHeight) continue;

    // Clip to screen Y range.
    const clipTopY = Math.max(far.y, state.maxY, 0);
    const clipBottomY = Math.min(near.y, screenHeight);

    if (clipTopY >= clipBottomY) continue;

    // Interpolate geometry at clip boundaries.
    const tTop = (clipTopY - far.y) / (near.y - far.y);
    const tBottom = (clipBottomY - far.y) / (near.y - far.y);

    const halfWidthTop = far.halfWidth + tTop * (near.halfWidth - far.halfWidth);
    const halfWidthBottom = far.halfWidth + tBottom * (near.halfWidth - far.halfWidth);
    const centerXTop = far.x + tTop * (near.x - far.x);
    const centerXBottom = far.x + tBottom * (near.x - far.x);

    // 1. Shoulder
    const shoulderHalfTop = halfWidthTop * SHOULDER_WIDTH_FACTOR;
    const shoulderHalfBottom = halfWidthBottom * SHOULDER_WIDTH_FACTOR;
    drawTrapezoid(
      ctx,
      centerXTop,
      centerXBottom,
      shoulderHalfTop,
      shoulderHalfBottom,
      clipTopY,
      clipBottomY,
      palette.guardrail,
    );

    // 2. Road surface (alternating colors)
    const roadColor = seg.colorVariant === 0 ? palette.road : palette.roadAlt;
    drawTrapezoid(ctx, centerXTop, centerXBottom, halfWidthTop, halfWidthBottom, clipTopY, clipBottomY, roadColor);

    // 3-5. Line details only on near segments — far away they would
    // render as constant-width bright specks (plan §12.5: far = fewer details).
    if (halfWidthBottom > 30) {
      // 3. Road edge lines
      const edgeWidthTop = Math.max(halfWidthTop * EDGE_LINE_WIDTH_FACTOR, 2);
      const edgeWidthBottom = Math.max(halfWidthBottom * EDGE_LINE_WIDTH_FACTOR, 2);
      drawTrapezoid(
        ctx,
        centerXTop - halfWidthTop,
        centerXBottom - halfWidthBottom,
        edgeWidthTop,
        edgeWidthBottom,
        clipTopY,
        clipBottomY,
        palette.headLight,
      );
      drawTrapezoid(
        ctx,
        centerXTop + halfWidthTop,
        centerXBottom + halfWidthBottom,
        edgeWidthTop,
        edgeWidthBottom,
        clipTopY,
        clipBottomY,
        palette.headLight,
      );

      // 4. Continuous center line
      const centerHalfTop = Math.max(halfWidthTop * CENTER_LINE_WIDTH_FACTOR, 1);
      const centerHalfBottom = Math.max(halfWidthBottom * CENTER_LINE_WIDTH_FACTOR, 1);
      drawTrapezoid(
        ctx,
        centerXTop,
        centerXBottom,
        centerHalfTop,
        centerHalfBottom,
        clipTopY,
        clipBottomY,
        palette.lane,
      );

      // 5. Dashed lane markings overlay
      if (seg.index % gameConfig.rumbleLength === 0) {
        const laneHalfTop = halfWidthTop * LANE_MARKER_WIDTH_FACTOR;
        const laneHalfBottom = halfWidthBottom * LANE_MARKER_WIDTH_FACTOR;
        drawTrapezoid(
          ctx,
          centerXTop,
          centerXBottom,
          laneHalfTop,
          laneHalfBottom,
          clipTopY,
          clipBottomY,
          palette.lane,
        );
      }
    }

    // Debug: segment boundaries
    if (debug && seg.index % 10 === 0) {
      ctx.strokeStyle = "#42d9e8";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(centerXBottom - halfWidthBottom, clipBottomY);
      ctx.lineTo(centerXBottom + halfWidthBottom, clipBottomY);
      ctx.stroke();
    }

    if (near.y > state.maxY) {
      state.maxY = near.y;
    }
  }
}

function drawTrapezoid(
  ctx: CanvasRenderingContext2D,
  centerTop: number,
  centerBottom: number,
  halfWidthTop: number,
  halfWidthBottom: number,
  yTop: number,
  yBottom: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(centerTop - halfWidthTop, yTop);
  ctx.lineTo(centerTop + halfWidthTop, yTop);
  ctx.lineTo(centerBottom + halfWidthBottom, yBottom);
  ctx.lineTo(centerBottom - halfWidthBottom, yBottom);
  ctx.closePath();
  ctx.fill();
}

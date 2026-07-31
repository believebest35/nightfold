import type { ProjectedSegment } from "./projected-segment.ts";
import type { ProjectionParams } from "./projection.ts";
import { gameConfig } from "../config/game-config.ts";
import { palette } from "../config/palette.ts";

const SHOULDER_WIDTH_FACTOR = 1.4;
const EDGE_LINE_WIDTH_FACTOR = 0.05;
const CENTER_LINE_WIDTH_FACTOR = 0.015;
const LANE_MARKER_WIDTH_FACTOR = 0.05;

/** Draw order bookkeeping shared across segments (one per frame). */
export interface RoadClipState {
  /** Highest screen Y drawn so far (lowest on screen). Used for occlusion. */
  maxY: number;
}

export function createRoadClipState(): RoadClipState {
  return { maxY: 0 };
}

/**
 * Draw one projected segment's road trapezoids.
 *
 * The caller iterates far → near and passes a shared clip state so
 * nearer segments never draw over farther ones and hill crests occlude
 * properly. All spatial data comes from the ProjectedSegment — this
 * function performs no projection of its own.
 */
export function renderRoadSegment(
  ctx: CanvasRenderingContext2D,
  ps: ProjectedSegment,
  params: ProjectionParams,
  debug: boolean,
  clip: RoadClipState,
): void {
  const { near, far } = ps;
  const screenHeight = params.screenHeight;

  // Skip segments entirely above or below the screen.
  if (far.y < 0 && near.y < 0) return;
  if (far.y > screenHeight && near.y > screenHeight) return;

  // Clip to screen Y range and to what has been drawn so far.
  const clipTopY = Math.max(far.y, clip.maxY, 0);
  const clipBottomY = Math.min(near.y, screenHeight);

  if (clipTopY >= clipBottomY) return;

  // Interpolate geometry at the clip boundaries.
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
  const roadColor = ps.seg.colorVariant === 0 ? palette.road : palette.roadAlt;
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
    if (ps.seg.index % gameConfig.rumbleLength === 0) {
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

  // Debug: segment boundary lines (index 0 and every 10th segment).
  if (debug && ps.seg.index % 10 === 0) {
    ctx.strokeStyle = palette.neonCyan;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerXBottom - halfWidthBottom, clipBottomY);
    ctx.lineTo(centerXBottom + halfWidthBottom, clipBottomY);
    ctx.stroke();
  }

  if (near.y > clip.maxY) {
    clip.maxY = near.y;
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

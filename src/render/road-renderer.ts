import type { RoadSegment, RenderContext } from "../model/types.ts";
import { projectWorldPoint, type ProjectionParams } from "./projection.ts";
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

/**
 * Draw road segments from far to near, generating perspective trapezoids.
 *
 * For each segment:
 * 1. Shoulder (wider, guardrail-colored)
 * 2. Road surface (alternating dark colors)
 * 3. Lane markings (dashed center line)
 */
export function renderRoad(
  ctx: CanvasRenderingContext2D,
  segments: RoadSegment[],
  params: ProjectionParams,
  _renderCtx: RenderContext,
  debug: boolean,
): void {
  if (segments.length === 0) return;

  // Project all segments first (from near to far for clipY tracking)
  // Then draw from far to near
  const projected = segments.map((seg) => {
    // p2 is farther (higher Z), p1 is nearer (lower Z)
    const far = projectWorldPoint(seg.p2.world, params);
    const near = projectWorldPoint(seg.p1.world, params);
    return { seg, far, near };
  });

  const screenHeight = params.screenHeight;

  // Draw from far to near (reverse order)
  const state: RoadDrawState = { maxY: 0 };

  for (let i = projected.length - 1; i >= 0; i--) {
    const item = projected[i];
    if (!item) continue;

    const { seg, far, near } = item;

    // Skip segments entirely above the screen (y < 0) or
    // entirely below the screen (y > screenHeight).
    // But keep segments that span across the screen boundary.
    if (far.y < 0 && near.y < 0) continue;
    if (far.y > screenHeight && near.y > screenHeight) continue;

    // Clip to screen Y range
    const clipTopY = Math.max(far.y, state.maxY, 0);
    const clipBottomY = Math.min(near.y, screenHeight);

    // Skip fully occluded or zero-height segments
    if (clipTopY >= clipBottomY) continue;

    // Interpolate halfWidth at clip boundaries
    const tTop = (clipTopY - far.y) / (near.y - far.y);
    const tBottom = (clipBottomY - far.y) / (near.y - far.y);

    const halfWidthTop = far.halfWidth + tTop * (near.halfWidth - far.halfWidth);
    const halfWidthBottom = far.halfWidth + tBottom * (near.halfWidth - far.halfWidth);
    const centerXTop = far.x + tTop * (near.x - far.x);
    const centerXBottom = far.x + tBottom * (near.x - far.x);

    // 1. Shoulder
    const shoulderHalfTop = halfWidthTop * SHOULDER_WIDTH_FACTOR;
    const shoulderHalfBottom = halfWidthBottom * SHOULDER_WIDTH_FACTOR;
    drawTrapezoid(ctx, centerXTop, centerXBottom, shoulderHalfTop, shoulderHalfBottom, clipTopY, clipBottomY, palette.guardrail);

    // 2. Road surface (alternating colors)
    const roadColor = seg.colorVariant === 0 ? palette.road : palette.roadAlt;
    drawTrapezoid(ctx, centerXTop, centerXBottom, halfWidthTop, halfWidthBottom, clipTopY, clipBottomY, roadColor);

    // 3. Road edge lines (bright borders at road limits)
    const edgeWidthTop = Math.max(halfWidthTop * EDGE_LINE_WIDTH_FACTOR, 2);
    const edgeWidthBottom = Math.max(halfWidthBottom * EDGE_LINE_WIDTH_FACTOR, 2);
    // Left edge
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
    // Right edge
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
    drawTrapezoid(ctx, centerXTop, centerXBottom, centerHalfTop, centerHalfBottom, clipTopY, clipBottomY, palette.headLight);

    // 5. Dashed lane markings overlay (thicker, every rumbleLength segments)
    if (seg.index % gameConfig.rumbleLength === 0) {
      const laneHalfTop = halfWidthTop * LANE_MARKER_WIDTH_FACTOR;
      const laneHalfBottom = halfWidthBottom * LANE_MARKER_WIDTH_FACTOR;
      drawTrapezoid(ctx, centerXTop, centerXBottom, laneHalfTop, laneHalfBottom, clipTopY, clipBottomY, palette.headLight);
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

    // Update maxY for occlusion
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

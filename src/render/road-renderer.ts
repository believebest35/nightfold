import type { ProjectedSegment } from "./projected-segment.ts";
import { projectWorldPoint, type ProjectionParams } from "./projection.ts";
import { gameConfig } from "../config/game-config.ts";
import { palette } from "../config/palette.ts";

const SHOULDER_WIDTH_FACTOR = 1.4;
const EDGE_LINE_WIDTH_FACTOR = 0.05;
const LANE_MARKER_WIDTH_FACTOR = 0.05;
/** Guardrail ribbon: world offset from road center and ribbon height. */
const RAIL_OFFSET = gameConfig.roadHalfWidth * 1.4 + 50;
const RAIL_HEIGHT = 250;
/** Ribbon half-width in world units. */
const RAIL_HALF_WIDTH = 25;

/** Draw order bookkeeping shared across segments (one per frame). */
export interface RoadClipState {
  /** Highest screen Y drawn so far (lowest on screen). Used for occlusion. */
  maxY: number;
}

/**
 * Result of rendering one segment: whether it was visible, and the
 * screen Y range it occupied. Scenery of the same segment must respect
 * clipTopY — a building base must not show through foreground terrain,
 * while its upper part may still rise above a hill crest.
 */
export interface SegmentVisibility {
  visible: boolean;
  clipTopY: number;
  clipBottomY: number;
}

export function createRoadClipState(): RoadClipState {
  return { maxY: 0 };
}

/**
 * Draw one projected segment's road trapezoids and its guardrail ribbon.
 *
 * The caller iterates far → near and passes a shared clip state so
 * nearer segments never draw over farther ones and hill crests occlude
 * properly. All spatial data comes from the ProjectedSegment — this
 * function performs only the rail ribbon's own projections.
 */
export function renderRoadSegment(
  ctx: CanvasRenderingContext2D,
  ps: ProjectedSegment,
  params: ProjectionParams,
  debug: boolean,
  clip: RoadClipState,
): SegmentVisibility {
  const { near, far } = ps;
  const screenHeight = params.screenHeight;
  const hidden: SegmentVisibility = { visible: false, clipTopY: 0, clipBottomY: 0 };

  // Skip segments entirely above or below the screen.
  if (far.y < 0 && near.y < 0) return hidden;
  if (far.y > screenHeight && near.y > screenHeight) return hidden;

  // Clip to screen Y range and to what has been drawn so far.
  const clipTopY = Math.max(far.y, clip.maxY, 0);
  const clipBottomY = Math.min(near.y, screenHeight);

  if (clipTopY >= clipBottomY) return hidden;

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

  // 3. Guardrail ribbon along both road edges, just outside the shoulder.
  drawGuardrailRibbon(ctx, ps, params, clipTopY, clipBottomY);

  // 4. Line details only on near segments — far away they would
  // render as constant-width bright specks (plan §12.5: far = fewer details).
  if (halfWidthBottom > 30) {
    // 4a. Road edge lines
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

    // 4b. Dashed center marking (no continuous line — that read as a
    // zipper over the dashes).
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

  // Debug: segment boundary lines.
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

  return { visible: true, clipTopY, clipBottomY };
}

/**
 * Continuous low guardrail ribbon following the road edge, built from
 * the shared projected geometry (road center + fixed world offset).
 * Vertices are clamped to the segment's clip band; the ribbon is low
 * enough that the approximation is invisible in practice.
 */
function drawGuardrailRibbon(
  ctx: CanvasRenderingContext2D,
  ps: ProjectedSegment,
  params: ProjectionParams,
  clipTopY: number,
  clipBottomY: number,
): void {
  const groundY = ps.seg.p1.world.worldY;
  const zFar = ps.zBase + gameConfig.segmentLength;

  for (const side of [-1, 1] as const) {
    const railX = side * RAIL_OFFSET;
    const nearBottom = projectWorldPoint(
      { worldX: ps.centerOffsetNear + railX, worldY: groundY, worldZ: ps.zBase },
      { ...params, roadHalfWidth: RAIL_HALF_WIDTH },
    );
    const farBottom = projectWorldPoint(
      { worldX: ps.centerOffsetFar + railX, worldY: groundY, worldZ: zFar },
      { ...params, roadHalfWidth: RAIL_HALF_WIDTH },
    );
    const nearTop = projectWorldPoint(
      { worldX: ps.centerOffsetNear + railX, worldY: groundY + RAIL_HEIGHT, worldZ: ps.zBase },
      { ...params, roadHalfWidth: RAIL_HALF_WIDTH * 0.8 },
    );
    const farTop = projectWorldPoint(
      { worldX: ps.centerOffsetFar + railX, worldY: groundY + RAIL_HEIGHT, worldZ: zFar },
      { ...params, roadHalfWidth: RAIL_HALF_WIDTH * 0.8 },
    );

    // Clamp all vertices into the segment's visible band; a degenerate
    // quad means this side's ribbon is fully occluded at this distance.
    const y0 = Math.max(nearBottom.y, clipTopY);
    const y1 = Math.max(farBottom.y, clipTopY);
    const y2 = Math.min(nearTop.y, clipBottomY);
    const y3 = Math.min(farTop.y, clipBottomY);
    if (Math.max(y0, y1) <= Math.min(y2, y3)) continue;

    ctx.fillStyle = palette.guardrail;
    ctx.beginPath();
    ctx.moveTo(nearBottom.x - nearBottom.halfWidth, y0);
    ctx.lineTo(farBottom.x + farBottom.halfWidth, y1);
    ctx.lineTo(farTop.x + farTop.halfWidth, y3);
    ctx.lineTo(nearTop.x - nearTop.halfWidth, y2);
    ctx.closePath();
    ctx.fill();
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

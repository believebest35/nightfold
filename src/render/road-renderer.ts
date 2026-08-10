import type { ProjectedSegment } from "./projected-segment.ts";
import { projectWorldPoint, type ProjectionParams } from "./projection.ts";
import type { RoadZone, ScreenPoint } from "../model/types.ts";
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
  replacementFade = 0,
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
  drawTrapezoid(
    ctx,
    centerXTop,
    centerXBottom,
    halfWidthTop,
    halfWidthBottom,
    clipTopY,
    clipBottomY,
    roadColor,
  );

  // 3. Guardrail ribbon along both road edges, just outside the shoulder.
  // Tunnel walls and river banks replace the rails progressively at the
  // zone seams instead of leaving a one-segment visual hole.
  drawGuardrailRibbon(ctx, ps, params, clipTopY, clipBottomY, replacementFade);

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

/** Four guardrail ribbon corners for one side of one segment. */
export interface GuardrailRibbonGeometry {
  nearBottom: ScreenPoint;
  farBottom: ScreenPoint;
  nearTop: ScreenPoint;
  farTop: ScreenPoint;
}

interface RibbonVertex {
  x: number;
  y: number;
}

/** The visible inner face of a guardrail ribbon. */
export interface GuardrailRibbonFace {
  nearBottom: RibbonVertex;
  farBottom: RibbonVertex;
  farTop: RibbonVertex;
  nearTop: RibbonVertex;
}

/** Visibility of one continuous rail while replacement scenery fades in. */
export function guardrailSideVisibility(
  zone: RoadZone,
  replacementFade: number,
  side: -1 | 1,
): number {
  const fade = Math.min(Math.max(replacementFade, 0), 1);
  if (zone === "tunnel") return 1 - fade;
  if (zone === "riverside" && side === -1) return 1 - fade;
  return 1;
}

/**
 * Project the guardrail ribbon corners for one side. The near edge uses
 * the segment's start height and the far edge its end height, so the
 * rail follows slopes instead of floating above or digging into them.
 * Pure and exported for tests.
 */
export function guardrailRibbonGeometry(
  ps: ProjectedSegment,
  params: ProjectionParams,
  side: -1 | 1,
): GuardrailRibbonGeometry {
  const nearGroundY = ps.seg.p1.world.worldY;
  const farGroundY = ps.seg.p2.world.worldY;
  const zFar = ps.zBase + gameConfig.segmentLength;
  const railX = side * RAIL_OFFSET;

  const nearBottom = projectWorldPoint(
    { worldX: ps.centerOffsetNear + railX, worldY: nearGroundY, worldZ: ps.zBase },
    { ...params, roadHalfWidth: RAIL_HALF_WIDTH },
  );
  const farBottom = projectWorldPoint(
    { worldX: ps.centerOffsetFar + railX, worldY: farGroundY, worldZ: zFar },
    { ...params, roadHalfWidth: RAIL_HALF_WIDTH },
  );
  const nearTop = projectWorldPoint(
    { worldX: ps.centerOffsetNear + railX, worldY: nearGroundY + RAIL_HEIGHT, worldZ: ps.zBase },
    { ...params, roadHalfWidth: RAIL_HALF_WIDTH * 0.8 },
  );
  const farTop = projectWorldPoint(
    { worldX: ps.centerOffsetFar + railX, worldY: farGroundY + RAIL_HEIGHT, worldZ: zFar },
    { ...params, roadHalfWidth: RAIL_HALF_WIDTH * 0.8 },
  );
  return { nearBottom, farBottom, nearTop, farTop };
}

/**
 * Build the visible ribbon face without twisting it across its width.
 * The left rail uses its right (road-facing) edge and the right rail its
 * left edge; near and far vertices therefore keep the same lateral side.
 * Pure and exported so tests cover the exact vertices used for drawing.
 */
export function guardrailRibbonFace(
  geometry: GuardrailRibbonGeometry,
  side: -1 | 1,
  clipTopY: number,
  clipBottomY: number,
): GuardrailRibbonFace | null {
  const nearBottomY = Math.max(geometry.nearBottom.y, clipTopY);
  const farBottomY = Math.max(geometry.farBottom.y, clipTopY);
  const nearTopY = Math.min(geometry.nearTop.y, clipBottomY);
  const farTopY = Math.min(geometry.farTop.y, clipBottomY);
  if (Math.max(nearBottomY, farBottomY) <= Math.min(nearTopY, farTopY)) return null;

  const innerEdgeX = (point: ScreenPoint): number => point.x - side * point.halfWidth;
  return {
    nearBottom: { x: innerEdgeX(geometry.nearBottom), y: nearBottomY },
    farBottom: { x: innerEdgeX(geometry.farBottom), y: farBottomY },
    farTop: { x: innerEdgeX(geometry.farTop), y: farTopY },
    nearTop: { x: innerEdgeX(geometry.nearTop), y: nearTopY },
  };
}

/**
 * Continuous low guardrail ribbon following the road edge and slope,
 * built from the shared projected geometry (road center + fixed world
 * offset). Vertices are clamped to the segment's clip band; the ribbon
 * is low enough that the approximation is invisible in practice.
 */
function drawGuardrailRibbon(
  ctx: CanvasRenderingContext2D,
  ps: ProjectedSegment,
  params: ProjectionParams,
  clipTopY: number,
  clipBottomY: number,
  replacementFade: number,
): void {
  // During the seam, both sides remain present until the replacement
  // scenery has become visible. Riverside eventually keeps only the dry
  // right-side rail; tunnel walls eventually replace both rails.
  const sides: Array<-1 | 1> = [-1, 1];
  for (const side of sides) {
    const alpha = guardrailSideVisibility(ps.seg.zone, replacementFade, side);
    if (alpha <= 0) continue;
    const g = guardrailRibbonGeometry(ps, params, side);
    const face = guardrailRibbonFace(g, side, clipTopY, clipBottomY);
    if (!face) continue;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = palette.guardrail;
    ctx.beginPath();
    ctx.moveTo(face.nearBottom.x, face.nearBottom.y);
    ctx.lineTo(face.farBottom.x, face.farBottom.y);
    ctx.lineTo(face.farTop.x, face.farTop.y);
    ctx.lineTo(face.nearTop.x, face.nearTop.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
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

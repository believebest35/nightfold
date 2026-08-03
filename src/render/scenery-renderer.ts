import type { ProjectedSegment } from "./projected-segment.ts";
import type { ProjectionParams } from "./projection.ts";
import type { SceneryObject } from "../model/types.ts";
import { projectWorldPoint } from "./projection.ts";
import { colorRgba, fogFactor, mixWithFog, parseHex } from "./fog.ts";
import { palette } from "../config/palette.ts";

/** Skip objects whose projected half-width falls below this (px). */
const MIN_SCREEN_HALF_WIDTH = 2;
/** Only draw window details on buildings at least this tall on screen. */
const WINDOW_MIN_HEIGHT = 90;
/** Only draw streetlight halos within this world distance. */
const HALO_MAX_Z = 9000;
/** Max window cell size on screen (px) — keeps near windows small. */
const MAX_WINDOW_WIDTH = 12;
const MAX_WINDOW_HEIGHT = 16;
/** Fraction of window cells that are lit (per-cell hash < this). */
export const WINDOW_LIT_RATIO = 0.25;

const buildingNearRgb = parseHex(palette.buildingNear);
const buildingFarRgb = parseHex(palette.buildingFar);

/**
 * Horizontal world offset of an object from the road center, signed by
 * side. Pure and exported for tests.
 */
export function objectWorldX(centerOffset: number, obj: SceneryObject): number {
  return centerOffset + (obj.side === "left" ? -obj.offset : obj.offset);
}

/**
 * Draw the scenery bound to one projected segment, honoring the road
 * segment's hill-crest clip: object bases are truncated at clipTopY so
 * nothing ground-level shows through foreground terrain, while tall
 * buildings may still rise above a crest.
 */
export function renderSceneryForSegment(
  ctx: CanvasRenderingContext2D,
  ps: ProjectedSegment,
  params: ProjectionParams,
  clipTopY: number,
): void {
  for (const obj of ps.seg.scenery) {
    renderObject(ctx, obj, ps, params, clipTopY);
  }
}

function renderObject(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  ps: ProjectedSegment,
  params: ProjectionParams,
  clipTopY: number,
): void {
  switch (obj.kind) {
    case "building":
      renderBuilding(ctx, obj, ps, params, clipTopY);
      break;
    case "streetlight":
      renderStreetlight(ctx, obj, ps, params, clipTopY);
      break;
    case "guardrail":
      renderGuardrail(ctx, obj, ps, params, clipTopY);
      break;
    default:
      break; // sign/tunnel-frame arrive with their zones in Phase 4
  }
}

/** Fog factor for the segment this object belongs to. */
function segmentFog(ps: ProjectedSegment, params: ProjectionParams): number {
  return fogFactor(ps.zBase - params.cameraZ);
}

/** Visible screen band for an object rooted at `baseY`, capped below by the crest. */
function visibleBand(baseY: number, clipTopY: number): number {
  return Math.max(baseY, clipTopY);
}

function renderBuilding(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  ps: ProjectedSegment,
  params: ProjectionParams,
  clipTopY: number,
): void {
  const worldX = objectWorldX(ps.centerOffsetNear, obj);
  const groundY = ps.seg.p1.world.worldY;
  const halfWidth = obj.width / 2;

  const base = projectWorldPoint(
    { worldX, worldY: groundY, worldZ: ps.zBase },
    { ...params, roadHalfWidth: halfWidth },
  );
  if (base.halfWidth < MIN_SCREEN_HALF_WIDTH) return;

  const top = projectWorldPoint(
    { worldX, worldY: groundY + obj.height, worldZ: ps.zBase },
    { ...params, roadHalfWidth: halfWidth * 0.85 },
  );

  // Hill crest may occlude the lower part of the building; the upper
  // part can still be visible above the crest.
  const bottomY = visibleBand(base.y, clipTopY);
  if (top.y >= bottomY) return;

  const t = segmentFog(ps, params);
  const baseRgb = obj.colorVariant === 0 ? buildingNearRgb : buildingFarRgb;
  ctx.fillStyle = mixWithFog(baseRgb, t);

  // Interpolate the bottom edge (truncated by the crest) between the
  // projected top and base edges.
  const truncT = (bottomY - top.y) / (base.y - top.y);
  const bottomHalfWidth = top.halfWidth + truncT * (base.halfWidth - top.halfWidth);
  const bottomX = top.x + truncT * (base.x - top.x);

  ctx.beginPath();
  ctx.moveTo(bottomX - bottomHalfWidth, bottomY);
  ctx.lineTo(bottomX + bottomHalfWidth, bottomY);
  ctx.lineTo(top.x + top.halfWidth, top.y);
  ctx.lineTo(top.x - top.halfWidth, top.y);
  ctx.closePath();
  ctx.fill();

  // Window lights: deterministic per-cell hash, only on near buildings.
  const screenHeight = bottomY - top.y;
  if (screenHeight >= WINDOW_MIN_HEIGHT && t < 0.45) {
    drawWindows(ctx, obj, top, bottomX, bottomHalfWidth, screenHeight);
  }
}

function drawWindows(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  top: { x: number; y: number; halfWidth: number },
  bottomX: number,
  bottomHalfWidth: number,
  screenHeight: number,
): void {
  // Grid density scales with screen size so big near buildings get more,
  // smaller windows instead of a few huge yellow rectangles.
  const columns = clamp(Math.floor((bottomHalfWidth * 2) / 28), 2, 8);
  const rows = clamp(Math.floor(screenHeight / 34), 3, 10);

  const stepX = (bottomHalfWidth * 2) / (columns + 1);
  const stepY = screenHeight / (rows + 1);
  const winW = Math.min(stepX * 0.36, MAX_WINDOW_WIDTH);
  const winH = Math.min(stepY * 0.4, MAX_WINDOW_HEIGHT);

  ctx.fillStyle = palette.windowWarm;
  for (let row = 0; row < rows; row++) {
    // Row's center and half-width interpolate along the tapered façade.
    const rowT = (row + 1) / (rows + 1);
    const rowCenterX = top.x + (bottomX - top.x) * rowT;
    const rowHalfWidth = top.halfWidth + (bottomHalfWidth - top.halfWidth) * rowT;
    const rowStepX = (rowHalfWidth * 2) / (columns + 1);
    const cy = top.y + rowT * screenHeight;

    for (let col = 0; col < columns; col++) {
      // Stable per-cell value from (id, row, col): ~WINDOW_LIT_RATIO of
      // cells are lit, scattered across the façade by the avalanche mix.
      if (!windowCellLit(obj.id, row, col)) continue;

      const cx = rowCenterX + (col + 1 - (columns + 1) / 2) * rowStepX;
      ctx.fillRect(cx - winW / 2, cy - winH / 2, winW, winH);
    }
  }
}

function renderStreetlight(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  ps: ProjectedSegment,
  params: ProjectionParams,
  clipTopY: number,
): void {
  const worldX = objectWorldX(ps.centerOffsetNear, obj);
  const groundY = ps.seg.p1.world.worldY;

  const base = projectWorldPoint(
    { worldX, worldY: groundY, worldZ: ps.zBase },
    { ...params, roadHalfWidth: obj.width / 2 },
  );
  if (base.halfWidth < MIN_SCREEN_HALF_WIDTH * 0.5) return;

  const top = projectWorldPoint(
    { worldX, worldY: groundY + obj.height, worldZ: ps.zBase },
    params,
  );

  const bottomY = visibleBand(base.y, clipTopY);
  if (top.y >= bottomY) return;

  const relativeZ = ps.zBase - params.cameraZ;
  const t = segmentFog(ps, params);

  // Pole (truncated by the crest; the lamp head may still show above it)
  ctx.strokeStyle = mixWithFog(parseHex(palette.guardrail), t);
  ctx.lineWidth = Math.max(base.halfWidth * 0.12, 1.5);
  ctx.beginPath();
  ctx.moveTo(base.x, bottomY);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();

  // Lamp head and halo share one visibility condition: screen Y grows
  // downward, so the head is visible only when it rises above the crest
  // clip line (top.y < clipTopY). The halo must never show through a
  // hill when the head itself is occluded.
  const lampVisible = lampHeadVisible(top.y, clipTopY);
  const lampSize = Math.max(base.halfWidth * 0.5, 2);
  if (lampVisible) {
    ctx.fillStyle = mixWithFog(parseHex(palette.headLight), t * 0.6);
    ctx.fillRect(top.x - lampSize, top.y - lampSize, lampSize * 2, lampSize);
  }

  // Warm halo only close to the camera, subdued so it never dominates.
  if (lampHaloVisible(lampVisible, relativeZ, t)) {
    const warm = parseHex(palette.windowWarm);
    ctx.fillStyle = colorRgba(warm, 0.08);
    ctx.beginPath();
    ctx.arc(top.x, top.y, lampSize * 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colorRgba(warm, 0.18);
    ctx.beginPath();
    ctx.arc(top.x, top.y, lampSize * 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderGuardrail(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  ps: ProjectedSegment,
  params: ProjectionParams,
  clipTopY: number,
): void {
  const worldX = objectWorldX(ps.centerOffsetNear, obj);
  const groundY = ps.seg.p1.world.worldY;

  const base = projectWorldPoint(
    { worldX, worldY: groundY, worldZ: ps.zBase },
    { ...params, roadHalfWidth: obj.width / 2 },
  );
  if (base.halfWidth < MIN_SCREEN_HALF_WIDTH * 0.4) return;

  const top = projectWorldPoint(
    { worldX, worldY: groundY + obj.height, worldZ: ps.zBase },
    params,
  );

  const bottomY = visibleBand(base.y, clipTopY);
  if (top.y >= bottomY) return;

  const t = segmentFog(ps, params);
  ctx.fillStyle = mixWithFog(parseHex(palette.guardrail), t);
  ctx.fillRect(base.x - base.halfWidth, top.y, base.halfWidth * 2, bottomY - top.y);
}

// ---------------------------------------------------------------------------
// Pure visibility / detail helpers, exported for tests.
// ---------------------------------------------------------------------------

/**
 * A streetlight lamp head is visible only above the crest clip line.
 * Screen Y grows downward, so a smaller topY means the head is higher.
 */
export function lampHeadVisible(topY: number, clipTopY: number): boolean {
  return topY < clipTopY;
}

/** Halo visibility = lamp head visible, plus the distance/fog limits. */
export function lampHaloVisible(lampVisible: boolean, relativeZ: number, fogT: number): boolean {
  return lampVisible && relativeZ < HALO_MAX_Z && fogT < 0.3;
}

/**
 * Stable per-window-cell value in [0, 1) derived from (id, row, col).
 * Purely deterministic — no Math.random. Row/col are avalanche-mixed into
 * the id hash with a 32-bit Math.imul chain so neighbouring cells scatter
 * instead of lighting up in whole blocks (the old linear mix moved every
 * cell by at most ~2^-32, which collapsed a whole façade into one value).
 */
export function windowCellValue(id: string, row: number, col: number): number {
  let h = hashString(id);
  h ^= Math.imul(row + 1, 0x9e3779b1);
  h ^= Math.imul(col + 1, 0x85ebca6b);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  h = Math.imul(h, 0x45d9f3b);
  h ^= h >>> 16;
  return (h >>> 0) / 0x100000000;
}

/** Whether a window cell is lit; ~WINDOW_LIT_RATIO of cells light up. */
export function windowCellLit(id: string, row: number, col: number): boolean {
  return windowCellValue(id, row, col) < WINDOW_LIT_RATIO;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** FNV-1a style stable hash for deterministic per-object details. */
function hashString(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

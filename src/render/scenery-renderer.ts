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

const buildingNearRgb = parseHex(palette.buildingNear);
const buildingFarRgb = parseHex(palette.buildingFar);

/**
 * Draw the scenery bound to one projected segment.
 *
 * The caller iterates far → near in the same pass as the road, so a
 * near building correctly occludes a farther road edge. Object world
 * positions derive from the ProjectedSegment's road center and
 * loop-expanded Z — never from raw segment data.
 */
export function renderSceneryForSegment(
  ctx: CanvasRenderingContext2D,
  ps: ProjectedSegment,
  params: ProjectionParams,
): void {
  for (const obj of ps.seg.scenery) {
    renderObject(ctx, obj, ps, params);
  }
}

function renderObject(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  ps: ProjectedSegment,
  params: ProjectionParams,
): void {
  switch (obj.kind) {
    case "building":
      renderBuilding(ctx, obj, ps, params);
      break;
    case "streetlight":
      renderStreetlight(ctx, obj, ps, params);
      break;
    case "guardrail":
      renderGuardrail(ctx, obj, ps, params);
      break;
    default:
      break; // sign/tunnel-frame arrive with their zones in Phase 4
  }
}

/** Horizontal offset from the road center, signed by side. */
function sideOffset(obj: SceneryObject): number {
  return obj.side === "left" ? -obj.offset : obj.offset;
}

/** World X of the object: road center at this segment + its own offset. */
function objectWorldX(ps: ProjectedSegment, obj: SceneryObject): number {
  return ps.centerOffsetNear + sideOffset(obj);
}

/** Fog factor for the segment this object belongs to. */
function segmentFog(ps: ProjectedSegment, params: ProjectionParams): number {
  return fogFactor(ps.zBase - params.cameraZ);
}

function renderBuilding(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  ps: ProjectedSegment,
  params: ProjectionParams,
): void {
  const worldX = objectWorldX(ps, obj);
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
  if (top.y >= base.y) return;

  const t = segmentFog(ps, params);
  const baseRgb = obj.colorVariant === 0 ? buildingNearRgb : buildingFarRgb;
  ctx.fillStyle = mixWithFog(baseRgb, t);

  // Slightly tapering trapezoid for a hint of perspective.
  ctx.beginPath();
  ctx.moveTo(base.x - base.halfWidth, base.y);
  ctx.lineTo(base.x + base.halfWidth, base.y);
  ctx.lineTo(top.x + top.halfWidth, top.y);
  ctx.lineTo(top.x - top.halfWidth, top.y);
  ctx.closePath();
  ctx.fill();

  // Window lights: deterministic from the id hash, only on near buildings.
  const screenHeight = base.y - top.y;
  if (screenHeight >= WINDOW_MIN_HEIGHT && t < 0.45) {
    drawWindows(ctx, obj, base, top, screenHeight);
  }
}

function drawWindows(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  base: { x: number; y: number; halfWidth: number },
  top: { x: number; y: number; halfWidth: number },
  screenHeight: number,
): void {
  const hash = hashString(obj.id);

  // Grid density scales with screen size so big near buildings get more,
  // smaller windows instead of a few huge yellow rectangles.
  const columns = clamp(Math.floor((base.halfWidth * 2) / 28), 2, 8);
  const rows = clamp(Math.floor(screenHeight / 34), 3, 10);

  const stepX = (base.halfWidth * 2) / (columns + 1);
  const stepY = screenHeight / (rows + 1);
  const winW = Math.min(stepX * 0.36, MAX_WINDOW_WIDTH);
  const winH = Math.min(stepY * 0.4, MAX_WINDOW_HEIGHT);

  ctx.fillStyle = palette.windowWarm;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      // ~45% of windows are lit; layout is stable per object.
      const bit = (hash >> (row * 5 + col)) & 1;
      if (bit === 0) continue;
      const cx = base.x + (col + 1 - (columns + 1) / 2) * stepX;
      const cy = top.y + (row + 1) * stepY;
      ctx.fillRect(cx - winW / 2, cy - winH / 2, winW, winH);
    }
  }
}

function renderStreetlight(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  ps: ProjectedSegment,
  params: ProjectionParams,
): void {
  const worldX = objectWorldX(ps, obj);
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
  if (top.y >= base.y) return;

  const relativeZ = ps.zBase - params.cameraZ;
  const t = segmentFog(ps, params);

  // Pole
  ctx.strokeStyle = mixWithFog(parseHex(palette.guardrail), t);
  ctx.lineWidth = Math.max(base.halfWidth * 0.12, 1.5);
  ctx.beginPath();
  ctx.moveTo(base.x, base.y);
  ctx.lineTo(top.x, top.y);
  ctx.stroke();

  // Lamp head
  const lampSize = Math.max(base.halfWidth * 0.5, 2);
  ctx.fillStyle = mixWithFog(parseHex(palette.headLight), t * 0.6);
  ctx.fillRect(top.x - lampSize, top.y - lampSize, lampSize * 2, lampSize);

  // Warm halo only close to the camera
  if (relativeZ < HALO_MAX_Z && t < 0.3) {
    const warm = parseHex(palette.windowWarm);
    ctx.fillStyle = colorRgba(warm, 0.1);
    ctx.beginPath();
    ctx.arc(top.x, top.y, lampSize * 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = colorRgba(warm, 0.25);
    ctx.beginPath();
    ctx.arc(top.x, top.y, lampSize * 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderGuardrail(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  ps: ProjectedSegment,
  params: ProjectionParams,
): void {
  const worldX = objectWorldX(ps, obj);
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
  if (top.y >= base.y) return;

  const t = segmentFog(ps, params);
  ctx.fillStyle = mixWithFog(parseHex(palette.guardrail), t);
  ctx.fillRect(base.x - base.halfWidth, top.y, base.halfWidth * 2, base.y - top.y);
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

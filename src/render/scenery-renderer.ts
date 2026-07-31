import type { RoadSegment, SceneryObject } from "../model/types.ts";
import { projectWorldPoint, type ProjectionParams } from "./projection.ts";
import { colorRgba, fogFactor, mixWithFog, parseHex } from "./fog.ts";
import { palette } from "../config/palette.ts";

/** Skip objects whose projected half-width or height falls below this. */
const MIN_SCREEN_HALF_WIDTH = 2;
/** Only draw window details on buildings at least this tall on screen. */
const WINDOW_MIN_HEIGHT = 90;
/** Only draw streetlight halos within this world distance. */
const HALO_MAX_Z = 9000;

const buildingNearRgb = parseHex(palette.buildingNear);
const buildingFarRgb = parseHex(palette.buildingFar);

/**
 * Draw scenery objects bound to the road segments ahead, far to near.
 *
 * Deterministic detail: building window layouts are derived from the
 * object id hash, so they never change between frames (plan §9).
 */
export function renderScenery(
  ctx: CanvasRenderingContext2D,
  segments: RoadSegment[],
  params: ProjectionParams,
): void {
  // Far to near, matching the road draw order so buildings sit correctly
  // against the road they belong to.
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (!seg) continue;
    for (const obj of seg.scenery) {
      renderObject(ctx, obj, seg, params);
    }
  }
}

function renderObject(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  seg: RoadSegment,
  params: ProjectionParams,
): void {
  switch (obj.kind) {
    case "building":
      renderBuilding(ctx, obj, seg, params);
      break;
    case "streetlight":
      renderStreetlight(ctx, obj, seg, params);
      break;
    case "guardrail":
      renderGuardrail(ctx, obj, seg, params);
      break;
    default:
      break; // sign/tunnel-frame arrive with their zones in Phase 4
  }
}

/** Horizontal world offset for an object, signed by side. */
function sideOffset(obj: SceneryObject): number {
  return obj.side === "left" ? -obj.offset : obj.offset;
}

function renderBuilding(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  seg: RoadSegment,
  params: ProjectionParams,
): void {
  const worldX = sideOffset(obj);
  const groundY = seg.p1.world.worldY;
  const halfWidth = obj.width / 2;

  const base = projectWorldPoint(
    { worldX, worldY: groundY, worldZ: seg.p1.world.worldZ },
    { ...params, roadHalfWidth: halfWidth },
  );
  if (base.scale <= 0 || base.halfWidth < MIN_SCREEN_HALF_WIDTH) return;

  const top = projectWorldPoint(
    { worldX, worldY: groundY + obj.height, worldZ: seg.p1.world.worldZ },
    { ...params, roadHalfWidth: halfWidth * 0.85 },
  );
  if (top.y >= base.y) return;

  const t = fogFactor(seg.p1.world.worldZ - params.cameraZ);
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
  if (base.y - top.y >= WINDOW_MIN_HEIGHT && t < 0.45) {
    drawWindows(ctx, obj, base, top);
  }
}

function drawWindows(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  base: { x: number; y: number; halfWidth: number },
  top: { x: number; y: number; halfWidth: number },
): void {
  const hash = hashString(obj.id);
  const columns = 2 + (hash % 3); // 2-4 columns
  const rows = 3 + ((hash >> 3) % 3); // 3-5 rows
  const stepX = (base.halfWidth * 2) / (columns + 1);
  const stepY = (base.y - top.y) / (rows + 1);

  ctx.fillStyle = palette.windowWarm;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      // ~45% of windows are lit; layout is stable per object.
      const bit = (hash >> (row * 4 + col)) & 1;
      if (bit === 0) continue;
      const cx = base.x + (col + 1 - (columns + 1) / 2) * stepX;
      const cy = top.y + (row + 1) * stepY;
      ctx.fillRect(cx - stepX * 0.18, cy - stepY * 0.3, stepX * 0.36, stepY * 0.4);
    }
  }
}

function renderStreetlight(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  seg: RoadSegment,
  params: ProjectionParams,
): void {
  const worldX = sideOffset(obj);
  const groundY = seg.p1.world.worldY;

  const base = projectWorldPoint(
    { worldX, worldY: groundY, worldZ: seg.p1.world.worldZ },
    { ...params, roadHalfWidth: obj.width / 2 },
  );
  if (base.scale <= 0 || base.halfWidth < MIN_SCREEN_HALF_WIDTH * 0.5) return;

  const top = projectWorldPoint(
    { worldX, worldY: groundY + obj.height, worldZ: seg.p1.world.worldZ },
    params,
  );
  if (top.y >= base.y) return;

  const relativeZ = seg.p1.world.worldZ - params.cameraZ;
  const t = fogFactor(relativeZ);

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
  seg: RoadSegment,
  params: ProjectionParams,
): void {
  const worldX = sideOffset(obj);
  const groundY = seg.p1.world.worldY;

  const base = projectWorldPoint(
    { worldX, worldY: groundY, worldZ: seg.p1.world.worldZ },
    { ...params, roadHalfWidth: obj.width / 2 },
  );
  if (base.scale <= 0 || base.halfWidth < MIN_SCREEN_HALF_WIDTH * 0.4) return;

  const top = projectWorldPoint(
    { worldX, worldY: groundY + obj.height, worldZ: seg.p1.world.worldZ },
    params,
  );
  if (top.y >= base.y) return;

  const t = fogFactor(seg.p1.world.worldZ - params.cameraZ);
  ctx.fillStyle = mixWithFog(parseHex(palette.guardrail), t);
  ctx.fillRect(base.x - base.halfWidth, top.y, base.halfWidth * 2, base.y - top.y);
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

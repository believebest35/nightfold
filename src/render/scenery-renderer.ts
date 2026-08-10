import type { ProjectedSegment } from "./projected-segment.ts";
import type { ProjectionParams } from "./projection.ts";
import type { SceneryObject } from "../model/types.ts";
import { projectWorldPoint } from "./projection.ts";
import { colorRgba, fogFactor, mixWithFog, parseHex } from "./fog.ts";
import { palette } from "../config/palette.ts";
import { gameConfig } from "../config/game-config.ts";

/** Skip objects whose projected half-width falls below this (px). */
const MIN_SCREEN_HALF_WIDTH = 2;
/** Only draw window details on buildings at least this tall on screen. */
const WINDOW_MIN_HEIGHT = 90;
/** Only draw streetlight halos within this world distance. */
const HALO_MAX_Z = 9000;
/** Tunnel frame every N segments; frame objects carry portal/detail slots. */
const TUNNEL_FRAME_INTERVAL = 6;
/** World-space tunnel roof height and half-width used by the shared projection. */
const TUNNEL_CEILING_HEIGHT = 2600;
const TUNNEL_ROOF_HALF_WIDTH = gameConfig.roadHalfWidth * 1.55;
/** Fade the tunnel mask over this many segments at both seams. */
export const TUNNEL_FADE_SEGMENTS = 12;
/** One frame-level environment pass; the road and lane markings remain readable. */
export const TUNNEL_ENVIRONMENT_ALPHA = 0.48;
/** Max window cell size on screen (px) — keeps near windows small. */
const MAX_WINDOW_WIDTH = 12;
const MAX_WINDOW_HEIGHT = 16;
/** Fraction of window cells that are lit (per-cell hash < this). */
export const WINDOW_LIT_RATIO = 0.25;

/** Projected tunnel opening used by the single frame-level environment pass. */
export interface TunnelApertureGeometry {
  centerX: number;
  nearSegmentIndex: number;
  farSegmentIndex: number;
  nearProgress: number;
  roofNearLeft: { x: number; y: number };
  roofNearRight: { x: number; y: number };
  roofFarLeft: { x: number; y: number };
  roofFarRight: { x: number; y: number };
  roadNearLeft: { x: number; y: number };
  roadNearRight: { x: number; y: number };
  roadFarLeft: { x: number; y: number };
  roadFarRight: { x: number; y: number };
  bottomY: number;
}

export interface SceneryRenderOptions {
  /** Draw tunnel beams/lights in the normal painter pass. */
  drawTunnelDetails?: boolean;
  /** Draw only the entrance portal for the selected outside-view segment. */
  drawTunnelPortal?: boolean;
}

export interface TunnelDetailOptions {
  /** The entrance is behind the camera once the camera is in the run. */
  suppressEntrancePortal?: boolean;
  /** Outside views never expose an exit on the same object. */
  suppressExitPortal?: boolean;
}

export interface TunnelPortalGeometry {
  roofLeft: { x: number; y: number };
  roofRight: { x: number; y: number };
  roadLeft: { x: number; y: number };
  roadRight: { x: number; y: number };
}

const buildingNearRgb = parseHex(palette.buildingNear);
const buildingFarRgb = parseHex(palette.buildingFar);
const tunnelEnvironmentRgb = parseHex("#000000");

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
  options: SceneryRenderOptions = {},
): void {
  const drawTunnelDetails = options.drawTunnelDetails ?? true;
  const drawTunnelPortal = options.drawTunnelPortal ?? false;
  for (const obj of ps.seg.scenery) {
    renderObject(ctx, obj, ps, params, clipTopY, drawTunnelDetails, drawTunnelPortal);
  }
}

/**
 * Draw only the tunnel beams and lamps for a second pass after the single
 * environment overlay. Keeping these details after the overlay preserves
 * the warm lights instead of letting the darkness pass cover them.
 */
export function renderTunnelFrameDetailsForSegment(
  ctx: CanvasRenderingContext2D,
  ps: ProjectedSegment,
  params: ProjectionParams,
  clipTopY: number,
  aperture?: TunnelApertureGeometry,
  options: TunnelDetailOptions = {},
): void {
  if (aperture) {
    ctx.save();
    clipTunnelAperture(ctx, aperture);
  }
  for (const obj of ps.seg.scenery) {
    if (obj.kind === "tunnel-frame") {
      renderTunnelFrameDetails(ctx, obj, ps, params, clipTopY, options);
    }
  }
  if (aperture) ctx.restore();
}

function renderObject(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  ps: ProjectedSegment,
  params: ProjectionParams,
  clipTopY: number,
  drawTunnelDetails: boolean,
  drawTunnelPortal: boolean,
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
    case "tunnel-frame":
      if (drawTunnelPortal && isEntrancePortal(obj)) {
        renderTunnelFrameDetails(ctx, obj, ps, params, clipTopY, {
          suppressExitPortal: true,
        });
      } else if (drawTunnelDetails) {
        renderTunnelFrameDetails(ctx, obj, ps, params, clipTopY);
      }
      break;
    case "river":
      renderRiver(ctx, obj, ps, params, clipTopY);
      break;
    case "bridge":
      renderBridge(ctx, obj, ps, params, clipTopY);
      break;
    default:
      break; // sign arrives with its zone later
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

function guardrailAlpha(ps: ProjectedSegment, side: "left" | "right"): number {
  const zoneObject = ps.seg.scenery.find((candidate) =>
    candidate.kind === "tunnel-frame" || candidate.kind === "river",
  );
  const replacementFade = zoneObject ? tunnelFade(zoneObject) : 0;
  if (ps.seg.zone === "tunnel") return 1 - replacementFade;
  if (ps.seg.zone === "riverside" && side === "left") return 1 - replacementFade;
  return 1;
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
  const alpha = guardrailAlpha(ps, obj.side);
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = mixWithFog(parseHex(palette.guardrail), t);
  ctx.fillRect(base.x - base.halfWidth, top.y, base.halfWidth * 2, bottomY - top.y);
  ctx.restore();
}

function renderTunnelFrameDetails(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  ps: ProjectedSegment,
  params: ProjectionParams,
  clipTopY: number,
  options: TunnelDetailOptions = {},
): void {
  const entrancePortal = isEntrancePortal(obj);
  const exitPortal = isExitPortal(obj);
  const isPortalDetail = entrancePortal || exitPortal;
  const drawEntrance = entrancePortal && !options.suppressEntrancePortal;
  if (isPortalDetail) {
    if (drawEntrance) {
      renderTunnelPortal(ctx, ps, params, true, tunnelFade(obj));
    }
    if (exitPortal && !options.suppressExitPortal) {
      renderTunnelPortal(ctx, ps, params, false, tunnelFade(obj));
    }
    return;
  }
  if (obj.segmentIndex % TUNNEL_FRAME_INTERVAL !== 0) return;
  const fade = tunnelFade(obj);
  const structureAlpha = Math.max(0.3, fade);
  const ribLeft = projectTunnelRoofPoint(ps, params, false, -1);
  const ribRight = projectTunnelRoofPoint(ps, params, false, 1);
  if (ribLeft.y >= clipTopY) return;
  const beamY = ribLeft.y;
  const beamLeftX = ribLeft.x;
  const beamRightX = ribRight.x;

  // Crossbeam at the far edge of the segment.
  ctx.save();
  ctx.globalAlpha = structureAlpha;
  ctx.strokeStyle = mixWithFog(parseHex(palette.tunnelFrame), segmentFog(ps, params));
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(beamLeftX, beamY);
  ctx.lineTo(beamRightX, ribRight.y);
  ctx.stroke();

  // Warm lamp at the crossbeam center.
  ctx.fillStyle = colorRgba(
    parseHex(palette.windowWarm),
    0.35 + structureAlpha * 0.55,
  );
  const lampW = Math.max(ps.far.halfWidth * 0.16, 2);
  ctx.fillRect(ps.far.x - lampW / 2, beamY - 3, lampW, 3);

  ctx.restore();
}

function renderTunnelPortal(
  ctx: CanvasRenderingContext2D,
  ps: ProjectedSegment,
  params: ProjectionParams,
  nearEdge: boolean,
  fade: number,
): void {
  const { roofLeft, roofRight, roadLeft, roadRight } = tunnelPortalGeometry(
    ps,
    params,
    nearEdge,
  );
  const alpha = Math.max(0.55, fade);
  ctx.save();
  ctx.globalAlpha = alpha;

  // Only the entrance gets a dark mouth surface. The exit remains open so
  // the already-rendered road, buildings and sky behind it stay visible.
  if (nearEdge) {
    ctx.fillStyle = colorRgba(parseHex(palette.tunnelInterior), 0.72);
    ctx.beginPath();
    ctx.moveTo(roofLeft.x, roofLeft.y);
    ctx.lineTo(roofRight.x, roofRight.y);
    ctx.lineTo(roadRight.x, roadRight.y);
    ctx.lineTo(roadLeft.x, roadLeft.y);
    ctx.closePath();
    ctx.fill();
  }

  // Do not leave a beam floating across the entire viewport when both
  // physical supports are behind the screen edges. The entrance mouth above
  // remains visible as a distant dark opening; the frame returns once a
  // support has a real screen intersection.
  const supportVisible = (x: number): boolean => x >= 0 && x <= params.screenWidth;
  if (!supportVisible(roofLeft.x) && !supportVisible(roadLeft.x) &&
      !supportVisible(roofRight.x) && !supportVisible(roadRight.x)) {
    ctx.restore();
    return;
  }

  ctx.strokeStyle = colorRgba(parseHex(palette.guardrail), 0.9);
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(roofLeft.x, roofLeft.y);
  ctx.lineTo(roofRight.x, roofRight.y);
  ctx.moveTo(roofLeft.x, roofLeft.y);
  ctx.lineTo(roadLeft.x, roadLeft.y);
  ctx.moveTo(roofRight.x, roofRight.y);
  ctx.lineTo(roadRight.x, roadRight.y);
  ctx.stroke();

  const lamp = interpolatePoint(roofLeft, roofRight, 0.5);
  if (lamp.y >= -8 && lamp.y <= params.screenHeight + 8) {
    ctx.fillStyle = palette.windowWarm;
    ctx.fillRect(lamp.x - 5, lamp.y - 3, 10, 5);
  }
  ctx.restore();
}

/** Project the four corners of an entrance or exit portal boundary. */
export function tunnelPortalGeometry(
  ps: ProjectedSegment,
  params: ProjectionParams,
  nearEdge: boolean,
): TunnelPortalGeometry {
  const roofLeft = projectTunnelRoofPoint(ps, params, nearEdge, -1);
  const roofRight = projectTunnelRoofPoint(ps, params, nearEdge, 1);
  const road = nearEdge ? ps.near : ps.far;
  return {
    roofLeft,
    roofRight,
    roadLeft: { x: road.x - road.halfWidth, y: road.y },
    roadRight: { x: road.x + road.halfWidth, y: road.y },
  };
}

function isEntrancePortal(obj: SceneryObject): boolean {
  return !obj.closedRun && obj.entryDist === 0;
}

function isExitPortal(obj: SceneryObject): boolean {
  return !obj.closedRun && obj.exitDist === 0;
}

/**
 * Dark river surface on the left bank with simplified warm reflection
 * streaks (plan §12.4). The bank edge runs just outside the shoulder;
 * the surface polygon spans from there to the left screen edge, and the
 * streaks are deterministic per segment and fade with the same seam
 * factor as the tunnel.
 */
function renderRiver(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  ps: ProjectedSegment,
  params: ProjectionParams,
  clipTopY: number,
): void {
  const fade = tunnelFade(obj);
  if (fade <= 0) return;

  const clipBottomY = Math.min(ps.near.y, params.screenHeight);
  const nearGroundY = ps.seg.p1.world.worldY;
  const farGroundY = ps.seg.p2.world.worldY;
  const innerEdge = obj.offset - obj.width / 2;
  const zFar = ps.zBase + gameConfig.segmentLength;

  // Surface: from the bank (road-facing edge of the river) out to the
  // left screen edge, bounded by the segment's clip band.
  const nearBank = projectWorldPoint(
    { worldX: ps.centerOffsetNear - innerEdge, worldY: nearGroundY, worldZ: ps.zBase },
    params,
  );
  const farBank = projectWorldPoint(
    { worldX: ps.centerOffsetFar - innerEdge, worldY: farGroundY, worldZ: zFar },
    params,
  );

  ctx.fillStyle = colorRgba(parseHex(palette.water), fade * 0.95);
  ctx.beginPath();
  ctx.moveTo(0, clipTopY);
  ctx.lineTo(farBank.x, Math.max(farBank.y, clipTopY));
  ctx.lineTo(nearBank.x, clipBottomY);
  ctx.lineTo(0, clipBottomY);
  ctx.closePath();
  ctx.fill();

  // Reflection streaks: two deterministic warm vertical bands inside
  // the water, fading at the seams and shrinking with distance.
  const hash = hashString(obj.id);
  const s1 = innerEdge + (0.15 + (((hash >>> 4) % 100) / 100) * 0.35) * obj.width;
  const s2 = innerEdge + (0.5 + (((hash >>> 14) % 100) / 100) * 0.4) * obj.width;
  for (const worldX of [s1, s2]) {
    const near = projectWorldPoint(
      { worldX: ps.centerOffsetNear - worldX, worldY: nearGroundY, worldZ: ps.zBase },
      params,
    );
    const far = projectWorldPoint(
      { worldX: ps.centerOffsetFar - worldX, worldY: farGroundY, worldZ: zFar },
      params,
    );
    if (near.x < 0 || near.x > params.screenWidth) continue;
    const yTop = Math.max(far.y, clipTopY);
    const yBottom = Math.min(near.y, clipBottomY);
    if (yTop >= yBottom) continue;
    ctx.fillStyle = colorRgba(parseHex(palette.windowWarm), 0.12 * fade);
    const w = Math.max(near.halfWidth * 0.06, 1.5);
    ctx.fillRect(near.x - w / 2, yTop, w, yBottom - yTop);
  }
}

/**
 * Rare distant bridge silhouette crossing the river (plan §12.4): a
 * dark deck with a few piers and cool lights, anchored at the river
 * side and reaching toward the road.
 */
function renderBridge(
  ctx: CanvasRenderingContext2D,
  obj: SceneryObject,
  ps: ProjectedSegment,
  params: ProjectionParams,
  clipTopY: number,
): void {
  const groundY = ps.seg.p1.world.worldY;
  const zFar = ps.zBase + gameConfig.segmentLength;

  const near = projectWorldPoint(
    { worldX: ps.centerOffsetNear - obj.offset, worldY: groundY, worldZ: ps.zBase },
    { ...params, roadHalfWidth: obj.width / 2 },
  );
  const far = projectWorldPoint(
    { worldX: ps.centerOffsetFar - obj.offset, worldY: groundY, worldZ: zFar },
    { ...params, roadHalfWidth: obj.width / 2 },
  );
  if (near.halfWidth < MIN_SCREEN_HALF_WIDTH) return;

  const deckY = Math.max(
    far.y - far.scale * obj.height * params.screenHeight * 0.5,
    clipTopY,
  );
  const pierBottomY = Math.max(far.y, clipTopY);
  if (deckY >= pierBottomY) return;

  const deckEndX = Math.min(near.x + near.halfWidth * 1.2, params.screenWidth);

  ctx.fillStyle = palette.skyline;
  ctx.fillRect(0, deckY, deckEndX, Math.max(3, (pierBottomY - deckY) * 0.03));

  ctx.fillStyle = palette.skyline;
  for (const fx of [0.25, 0.5, 0.75]) {
    ctx.fillRect(deckEndX * fx - 1.5, deckY, 3, pierBottomY - deckY);
  }

  // Cool deck lights.
  ctx.fillStyle = colorRgba(parseHex(palette.neonCyan), 0.5);
  for (const fx of [0.2, 0.45, 0.7, 0.95]) {
    ctx.fillRect(deckEndX * fx - 1, deckY + 3, 2, 2);
  }
}

// ---------------------------------------------------------------------------
// Pure visibility / detail helpers, exported for tests.
// ---------------------------------------------------------------------------

/**
 * Darkness for the current camera, evaluated continuously within its
 * segment. A camera outside the tunnel always returns 0, even if tunnel
 * segments are visible ahead in the draw distance.
 */
export function tunnelEnvironmentFade(
  cameraZone: "city" | "elevated" | "tunnel" | "riverside",
  entryDist?: number,
  exitDist?: number,
  segmentProgress = 0,
): number {
  if (cameraZone !== "tunnel" || entryDist === undefined || exitDist === undefined) {
    return 0;
  }
  const progress = clamp(segmentProgress, 0, 1);
  return zoneFade(entryDist + progress, exitDist + (1 - progress));
}

/**
 * Project one continuous tunnel environment from the nearest and farthest
 * segment in the camera's current tunnel run. The result is intentionally
 * made from road/roof points rather than viewport percentages.
 */
export function tunnelApertureGeometry(
  params: ProjectionParams,
  nearSegment: ProjectedSegment,
  farSegment: ProjectedSegment,
): TunnelApertureGeometry {
  const roofNearLeft = projectTunnelRoofPoint(nearSegment, params, true, -1);
  const roofNearRight = projectTunnelRoofPoint(nearSegment, params, true, 1);
  const roofFarLeft = projectTunnelRoofPoint(farSegment, params, false, -1);
  const roofFarRight = projectTunnelRoofPoint(farSegment, params, false, 1);
  const roadNearLeft = {
    x: nearSegment.near.x - nearSegment.near.halfWidth,
    y: nearSegment.near.y,
  };
  const roadNearRight = {
    x: nearSegment.near.x + nearSegment.near.halfWidth,
    y: nearSegment.near.y,
  };
  const roadFarLeft = {
    x: farSegment.far.x - farSegment.far.halfWidth,
    y: farSegment.far.y,
  };
  const roadFarRight = {
    x: farSegment.far.x + farSegment.far.halfWidth,
    y: farSegment.far.y,
  };
  return {
    centerX: (nearSegment.near.x + farSegment.far.x) / 2,
    nearSegmentIndex: nearSegment.seg.index,
    farSegmentIndex: farSegment.seg.index,
    nearProgress: nearSegment.nearProgress,
    roofNearLeft,
    roofNearRight,
    roofFarLeft,
    roofFarRight,
    roadNearLeft,
    roadNearRight,
    roadFarLeft,
    roadFarRight,
    bottomY: params.screenHeight,
  };
}

function projectTunnelRoofPoint(
  ps: ProjectedSegment,
  params: ProjectionParams,
  near: boolean,
  side: -1 | 1,
): { x: number; y: number } {
  const centerOffset = near ? ps.centerOffsetNear : ps.centerOffsetFar;
  const worldY = near ? ps.nearWorldY : ps.farWorldY;
  const worldZ = near ? ps.nearWorldZ : ps.farWorldZ;
  const point = projectWorldPoint(
    {
      worldX: centerOffset + side * TUNNEL_ROOF_HALF_WIDTH,
      worldY: worldY + TUNNEL_CEILING_HEIGHT,
      worldZ,
    },
    params,
  );
  return { x: point.x, y: point.y };
}

/** Draw the single projected tunnel environment for the current frame. */
export function renderTunnelEnvironment(
  ctx: CanvasRenderingContext2D,
  params: ProjectionParams,
  fade: number,
  nearSegment: ProjectedSegment | undefined,
  farSegment: ProjectedSegment | undefined,
): TunnelApertureGeometry | null {
  if (fade <= 0 || !nearSegment || !farSegment) return null;
  const aperture = tunnelApertureGeometry(params, nearSegment, farSegment);
  const t = clamp(fade, 0, 1);
  ctx.save();

  // The road-facing darkness is one projected band, bounded by the actual
  // tunnel run. It cannot accumulate across visible segments and it stops at
  // the far portal instead of dimming a later city/tunnel run.
  ctx.fillStyle = colorRgba(tunnelEnvironmentRgb, t * TUNNEL_ENVIRONMENT_ALPHA);
  drawTunnelRoadPath(ctx, aperture);
  ctx.fill();

  // The roof and side surfaces are one projected structure, not repeated
  // segment overlays. Their alpha follows the same camera fade, so the
  // entrance and exit reveal the world continuously.
  ctx.fillStyle = colorRgba(parseHex(palette.tunnelInterior), t * 0.86);
  drawTunnelRoofPath(ctx, aperture);
  ctx.fill();
  const wallGradient = ctx.createLinearGradient(
    0,
    Math.min(aperture.roofFarLeft.y, aperture.roofFarRight.y),
    0,
    Math.max(aperture.roadFarLeft.y, aperture.roadFarRight.y),
  );
  wallGradient.addColorStop(0, colorRgba(parseHex(palette.tunnelInterior), t * 0.94));
  wallGradient.addColorStop(0.72, colorRgba(parseHex(palette.tunnelInterior), t * 0.35));
  wallGradient.addColorStop(1, colorRgba(parseHex(palette.tunnelInterior), 0));
  ctx.fillStyle = wallGradient;
  drawTunnelLeftWallPath(ctx, aperture, 0);
  ctx.fill();
  drawTunnelRightWallPath(ctx, aperture, params.screenWidth);
  ctx.fill();

  // The projected roof edge is the only broad boundary line. It follows
  // curves and player lateral offset instead of becoming a screen-fixed bar.
  ctx.strokeStyle = colorRgba(parseHex(palette.guardrail), t * 0.72);
  ctx.lineWidth = Math.max(2, params.screenWidth * 0.004);
  ctx.beginPath();
  ctx.moveTo(aperture.roofNearLeft.x, aperture.roofNearLeft.y);
  ctx.lineTo(aperture.roofFarLeft.x, aperture.roofFarLeft.y);
  ctx.moveTo(aperture.roofNearRight.x, aperture.roofNearRight.y);
  ctx.lineTo(aperture.roofFarRight.x, aperture.roofFarRight.y);
  ctx.stroke();

  // A few roof ribs make the ceiling read as a tunnel structure rather than
  // a screen-space filter. They are interpolated between the same projected
  // portal edges, so they bend with the road and move with playerX.
  ctx.strokeStyle = colorRgba(parseHex(palette.guardrail), t * 0.82);
  ctx.lineWidth = Math.max(2, params.screenWidth * 0.004);
  for (const fraction of [0.25, 0.5, 0.75]) {
    const left = interpolatePoint(aperture.roofNearLeft, aperture.roofFarLeft, fraction);
    const right = interpolatePoint(aperture.roofNearRight, aperture.roofFarRight, fraction);
    ctx.beginPath();
    ctx.moveTo(left.x, left.y);
    ctx.lineTo(right.x, right.y);
    ctx.stroke();

    const lamp = interpolatePoint(left, right, 0.5);
    if (lamp.y >= -6 && lamp.y <= params.screenHeight + 6) {
      ctx.fillStyle = palette.windowWarm;
      ctx.globalAlpha = t * 0.88;
      ctx.fillRect(lamp.x - 3, lamp.y - 2, 6, 4);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  return aperture;
}

function interpolatePoint(
  a: { x: number; y: number },
  b: { x: number; y: number },
  fraction: number,
): { x: number; y: number } {
  return {
    x: a.x + (b.x - a.x) * fraction,
    y: a.y + (b.y - a.y) * fraction,
  };
}

function clipTunnelAperture(
  ctx: CanvasRenderingContext2D,
  aperture: TunnelApertureGeometry,
): void {
  drawTunnelInteriorPath(ctx, aperture);
  ctx.clip();
}

function drawTunnelInteriorPath(
  ctx: CanvasRenderingContext2D,
  aperture: TunnelApertureGeometry,
): void {
  ctx.beginPath();
  ctx.moveTo(aperture.roofNearLeft.x, aperture.roofNearLeft.y);
  ctx.lineTo(aperture.roofFarLeft.x, aperture.roofFarLeft.y);
  ctx.lineTo(aperture.roofFarRight.x, aperture.roofFarRight.y);
  ctx.lineTo(aperture.roofNearRight.x, aperture.roofNearRight.y);
  ctx.lineTo(aperture.roadNearRight.x, aperture.roadNearRight.y);
  ctx.lineTo(aperture.roadFarRight.x, aperture.roadFarRight.y);
  ctx.lineTo(aperture.roadFarLeft.x, aperture.roadFarLeft.y);
  ctx.lineTo(aperture.roadNearLeft.x, aperture.roadNearLeft.y);
  ctx.closePath();
}

function drawTunnelRoadPath(
  ctx: CanvasRenderingContext2D,
  aperture: TunnelApertureGeometry,
): void {
  ctx.beginPath();
  ctx.moveTo(aperture.roadNearLeft.x, aperture.roadNearLeft.y);
  ctx.lineTo(aperture.roadFarLeft.x, aperture.roadFarLeft.y);
  ctx.lineTo(aperture.roadFarRight.x, aperture.roadFarRight.y);
  ctx.lineTo(aperture.roadNearRight.x, aperture.roadNearRight.y);
  ctx.closePath();
}

function drawTunnelRoofPath(
  ctx: CanvasRenderingContext2D,
  aperture: TunnelApertureGeometry,
): void {
  ctx.beginPath();
  ctx.moveTo(aperture.roofNearLeft.x, aperture.roofNearLeft.y);
  ctx.lineTo(aperture.roofFarLeft.x, aperture.roofFarLeft.y);
  ctx.lineTo(aperture.roofFarRight.x, aperture.roofFarRight.y);
  ctx.lineTo(aperture.roofNearRight.x, aperture.roofNearRight.y);
  ctx.closePath();
}

function drawTunnelLeftWallPath(
  ctx: CanvasRenderingContext2D,
  aperture: TunnelApertureGeometry,
  screenEdgeX: number,
): void {
  ctx.beginPath();
  ctx.moveTo(screenEdgeX, aperture.roofNearLeft.y);
  ctx.lineTo(aperture.roofFarLeft.x, aperture.roofFarLeft.y);
  ctx.lineTo(aperture.roadFarLeft.x, aperture.roadFarLeft.y);
  ctx.lineTo(screenEdgeX, aperture.roadFarLeft.y);
  ctx.closePath();
}

function drawTunnelRightWallPath(
  ctx: CanvasRenderingContext2D,
  aperture: TunnelApertureGeometry,
  screenEdgeX: number,
): void {
  ctx.beginPath();
  ctx.moveTo(screenEdgeX, aperture.roofNearRight.y);
  ctx.lineTo(aperture.roofFarRight.x, aperture.roofFarRight.y);
  ctx.lineTo(aperture.roadFarRight.x, aperture.roadFarRight.y);
  ctx.lineTo(screenEdgeX, aperture.roadFarRight.y);
  ctx.closePath();
}

function zoneFade(entryDist: number, exitDist: number): number {
  if (!Number.isFinite(entryDist) || !Number.isFinite(exitDist)) return 0;
  const entry = Math.max(entryDist, 0);
  const exit = Math.max(exitDist, 0);
  return Math.max(
    Math.min(entry / TUNNEL_FADE_SEGMENTS, exit / TUNNEL_FADE_SEGMENTS, 1),
    0,
  );
}

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

/**
 * Tunnel darkness factor in [0, 1] for a tunnel-frame object: 0 right at
 * the entrance, ramping to 1 past TUNNEL_FADE_SEGMENTS, and mirrored at
 * the exit — so both seams fade instead of snapping. Pure, exported for
 * tests.
 */
export function tunnelFade(obj: SceneryObject): number {
  if (obj.closedRun) return 1;
  const entry = obj.entryDist ?? 0;
  const exit = obj.exitDist ?? 0;
  if (obj.entryDist === undefined || obj.exitDist === undefined) return 0;
  return zoneFade(entry, exit);
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

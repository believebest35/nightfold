import type { WorldPoint, ScreenPoint } from "../model/types.ts";

/**
 * Compute camera depth from field-of-view angle.
 * cameraDepth = 1 / tan(fovDegrees / 2)
 */
export function computeCameraDepth(fovDegrees: number): number {
  const halfFovRad = (fovDegrees / 2) * (Math.PI / 180);
  return 1 / Math.tan(halfFovRad);
}

export interface ProjectionParams {
  cameraX: number;
  cameraY: number;
  cameraZ: number;
  cameraDepth: number;
  screenWidth: number;
  screenHeight: number;
  roadHalfWidth: number;
}

/**
 * Project a world point to screen coordinates.
 *
 * Returns a ScreenPoint with x, y, halfWidth, and scale.
 * Guards against relativeZ <= 0 by clamping to a minimum safe value,
 * preventing NaN, Infinity, or negative widths.
 *
 * clipY is initialized to 0 here; the road renderer updates it
 * per-segment during the far-to-near draw pass.
 */
export function projectWorldPoint(world: WorldPoint, params: ProjectionParams): ScreenPoint {
  const relativeX = world.worldX - params.cameraX;
  const relativeY = world.worldY - params.cameraY;
  const relativeZ = world.worldZ - params.cameraZ;

  // Prevent division by zero / negative Z (objects behind or at camera)
  const safeZ = Math.max(relativeZ, 0.001);
  const scale = params.cameraDepth / safeZ;

  const screenCenterX = params.screenWidth / 2;
  const screenCenterY = params.screenHeight / 2;

  const x = screenCenterX + scale * relativeX * params.screenWidth * 0.5;
  const y = screenCenterY - scale * relativeY * params.screenHeight * 0.5;
  const halfWidth = scale * params.roadHalfWidth * params.screenWidth * 0.5;

  return {
    x,
    y,
    halfWidth: Math.max(halfWidth, 0),
    scale,
    clipY: 0,
  };
}

/**
 * Check whether a point at relativeZ is in front of the camera
 * and should be rendered.
 */
export function isInFrontOfCamera(relativeZ: number, nearClip: number): boolean {
  return relativeZ > nearClip;
}

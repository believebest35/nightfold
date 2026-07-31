import type { RoadSegment } from "../model/types.ts";

export interface RoadStateAtZ {
  /** Road center world-X offset accumulated from segment 0. */
  offset: number;
  /** Road direction derivative (dx) at this Z — used to seed curve rendering. */
  offsetRate: number;
}

/**
 * Query road segments ahead of the camera, handling loop wraparound.
 *
 * Returns up to `count` segments starting from the segment after the
 * one that contains `positionZ`, so every returned segment lies fully
 * ahead of the camera.
 */
export function getSegmentsAhead(
  segments: RoadSegment[],
  totalLength: number,
  positionZ: number,
  count: number,
): RoadSegment[] {
  if (segments.length === 0 || count <= 0) {
    return [];
  }

  const segmentLength = totalLength / segments.length;
  const wrappedZ = wrapZ(positionZ, totalLength);
  const containingIdx = Math.floor(wrappedZ / segmentLength);
  const baseIndex = (containingIdx + 1) % segments.length;

  const result: RoadSegment[] = [];
  for (let i = 0; i < count; i++) {
    const seg = segments[(baseIndex + i) % segments.length];
    if (seg) {
      result.push(seg);
    }
  }
  return result;
}

/**
 * The running road state (lateral offset and its derivative) at a given
 * world Z, accumulated from segment 0.
 *
 * This is O(camera index) — at most one full loop (~350 segments) per
 * frame, which is negligible. Seeding the renderer with this derivative
 * keeps the camera's horizontal tangent continuous across the loop
 * boundary (valid because the recipe's Σcurve = 0).
 */
export function getRoadStateAtZ(
  segments: RoadSegment[],
  totalLength: number,
  positionZ: number,
): RoadStateAtZ {
  if (segments.length === 0) {
    return { offset: 0, offsetRate: 0 };
  }

  const segmentLength = totalLength / segments.length;
  const wrappedZ = wrapZ(positionZ, totalLength);
  const containingIdx = Math.floor(wrappedZ / segmentLength);

  let x = 0;
  let dx = 0;
  for (let i = 0; i < containingIdx; i++) {
    const seg = segments[i];
    if (!seg) break;
    x += dx;
    dx += seg.curve;
  }
  return { offset: x, offsetRate: dx };
}

/**
 * Expand a segment's start Z into the camera's forward coordinate
 * system: if the segment's raw Z is behind the camera (wrapped around
 * the loop), add one totalLength so projection sees it ahead.
 */
export function expandSegmentZ(
  seg: RoadSegment,
  totalLength: number,
  positionZ: number,
): number {
  const rawZ = seg.p1.world.worldZ;
  return rawZ < positionZ ? rawZ + totalLength : rawZ;
}

/** Find the segment that contains the given world Z. */
export function findSegmentAtZ(
  segments: RoadSegment[],
  totalLength: number,
  positionZ: number,
): RoadSegment | undefined {
  if (segments.length === 0) return undefined;

  const segmentLength = totalLength / segments.length;
  const wrappedZ = wrapZ(positionZ, totalLength);
  const index = Math.floor(wrappedZ / segmentLength);
  return segments[index];
}

/** World Y at a given Z by linear interpolation within its segment. */
export function getRoadYAtZ(
  segments: RoadSegment[],
  totalLength: number,
  positionZ: number,
): number {
  const seg = findSegmentAtZ(segments, totalLength, positionZ);
  if (!seg) return 0;

  const segmentLength = totalLength / segments.length;
  const segStartZ = seg.index * segmentLength;
  const t = (positionZ - segStartZ) / segmentLength;

  return seg.p1.world.worldY + t * (seg.p2.world.worldY - seg.p1.world.worldY);
}

/** Wrap an arbitrary Z into [0, totalLength). */
function wrapZ(positionZ: number, totalLength: number): number {
  return ((positionZ % totalLength) + totalLength) % totalLength;
}

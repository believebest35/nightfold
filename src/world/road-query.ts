import type { RoadSegment } from "../model/types.ts";

/**
 * Query road segments ahead of the camera, handling loop wraparound.
 *
 * Returns up to `count` segments starting from the segment that contains
 * `positionZ`. The segment at `positionZ % totalLength` is included as
 * the first result, followed by subsequent segments in order.
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
  // Clamp position into [0, totalLength) for loop wrapping
  const wrappedZ = ((positionZ % totalLength) + totalLength) % totalLength;

  // Find the segment index that contains wrappedZ,
  // then advance one segment so all returned segments are fully ahead of the camera
  const containingIdx = Math.floor(wrappedZ / segmentLength);
  const baseIndex = (containingIdx + 1) % segments.length;

  const result: RoadSegment[] = [];
  for (let i = 0; i < count; i++) {
    const idx = (baseIndex + i) % segments.length;
    const seg = segments[idx];
    if (seg) {
      result.push(seg);
    }
  }

  return result;
}

/**
 * Find the segment that contains the given world Z position.
 * Returns undefined if position is out of bounds.
 */
export function findSegmentAtZ(
  segments: RoadSegment[],
  totalLength: number,
  positionZ: number,
): RoadSegment | undefined {
  if (segments.length === 0) return undefined;

  const segmentLength = totalLength / segments.length;
  const wrappedZ = ((positionZ % totalLength) + totalLength) % totalLength;
  const index = Math.floor(wrappedZ / segmentLength);
  return segments[index];
}

/**
 * Get the world Y at a given Z position by linear interpolation
 * between the segment's start and end heights.
 */
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

import type { RoadSegment, ScreenPoint } from "../model/types.ts";
import { projectWorldPoint, type ProjectionParams } from "./projection.ts";
import { expandSegmentZ } from "../world/road-query.ts";
import { gameConfig } from "../config/game-config.ts";

/**
 * A road segment with its single, authoritative spatial interpretation.
 *
 * Both the road renderer and the scenery renderer consume these; nobody
 * re-derives curve offsets or loop-expanded Z from the raw segment. This
 * guarantees scenery always follows the same road center the road itself
 * renders along.
 */
export interface ProjectedSegment {
  seg: RoadSegment;
  /** Loop-expanded world Z of the segment start (always ahead of camera). */
  zBase: number;
  /** Curve-accumulated road-center lateral offset at the segment start. */
  centerOffsetNear: number;
  /** Curve-accumulated road-center lateral offset at the segment end. */
  centerOffsetFar: number;
  /** Projected geometry of the near edge. */
  near: ScreenPoint;
  /** Projected geometry of the far edge. */
  far: ScreenPoint;
  /** World-space road height used by the near cross-section. */
  nearWorldY: number;
  /** World-space road height used by the far cross-section. */
  farWorldY: number;
  /** World-space Z used by the near cross-section. */
  nearWorldZ: number;
  /** World-space Z used by the far cross-section. */
  farWorldZ: number;
  /** Fractional position of the near edge in the source segment. */
  nearProgress: number;
}

export interface ProjectInput {
  /** Road direction derivative (dx) at the camera, for curve integration. */
  offsetRate: number;
  /** Player lateral position in world units (playerX * roadHalfWidth). */
  playerWorldX: number;
  /** Total loop length, for wrapped Z expansion. */
  totalLength: number;
}

/**
 * The single authoritative projection pass for the road ahead (plan §7.3):
 *
 *   x += dx; dx += segment.curve
 *
 * accumulates the road center's lateral offset from the camera, and
 * expandSegmentZ unwraps the loop so every returned segment lies ahead
 * of the camera. The near edge of a segment uses the previous segment's
 * far offset, so curves sweep continuously instead of kinking.
 */
export function projectSegmentsAhead(
  segments: RoadSegment[],
  params: ProjectionParams,
  input: ProjectInput,
): ProjectedSegment[] {
  if (segments.length === 0) return [];

  const projParams: ProjectionParams = {
    ...params,
    cameraX: input.playerWorldX,
  };

  let x = 0;
  let dx = input.offsetRate;
  let prevX = 0;

  return segments.map((seg) => {
    x += dx;
    dx += seg.curve;

    const zBase = expandSegmentZ(seg, input.totalLength, params.cameraZ);
    const zFar = zBase + gameConfig.segmentLength;

    const near = projectWorldPoint(
      { worldX: prevX, worldY: seg.p1.world.worldY, worldZ: zBase },
      projParams,
    );
    const far = projectWorldPoint(
      { worldX: x, worldY: seg.p2.world.worldY, worldZ: zFar },
      projParams,
    );

    const result: ProjectedSegment = {
      seg,
      zBase,
      centerOffsetNear: prevX,
      centerOffsetFar: x,
      near,
      far,
      nearWorldY: seg.p1.world.worldY,
      farWorldY: seg.p2.world.worldY,
      nearWorldZ: zBase,
      farWorldZ: zFar,
      nearProgress: 0,
    };
    prevX = x;
    return result;
  });
}

/**
 * Project the portion of the segment containing the camera that is still in
 * front of the camera. The raw segment start can be behind the camera, so it
 * is deliberately not passed through `projectSegmentsAhead` unchanged.
 */
export function projectCurrentSegment(
  segment: RoadSegment,
  params: ProjectionParams,
  input: ProjectInput,
  progress: number,
): ProjectedSegment {
  const t = Math.min(Math.max(progress, 0), 1);
  const remaining = Math.max(1, gameConfig.segmentLength * (1 - t));
  const nearWorldY = segment.p1.world.worldY +
    (segment.p2.world.worldY - segment.p1.world.worldY) * t;
  const farWorldY = segment.p2.world.worldY;
  const nearWorldZ = params.cameraZ + 1;
  const farWorldZ = params.cameraZ + remaining;
  const farOffset = input.offsetRate * (1 - t);
  const projParams: ProjectionParams = {
    ...params,
    cameraX: input.playerWorldX,
  };
  const near = projectWorldPoint(
    { worldX: 0, worldY: nearWorldY, worldZ: nearWorldZ },
    projParams,
  );
  const far = projectWorldPoint(
    { worldX: farOffset, worldY: farWorldY, worldZ: farWorldZ },
    projParams,
  );

  return {
    seg: segment,
    zBase: nearWorldZ,
    centerOffsetNear: 0,
    centerOffsetFar: farOffset,
    near,
    far,
    nearWorldY,
    farWorldY,
    nearWorldZ,
    farWorldZ,
    nearProgress: t,
  };
}

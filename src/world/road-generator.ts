import type { RoadSegment } from "../model/types.ts";
import { gameConfig } from "../config/game-config.ts";
import { RoadBuilder } from "./road-builder.ts";

export interface GeneratedRoad {
  segments: RoadSegment[];
  totalLength: number;
}

/** Straight flat looping road (used by tests and Phase 1 debugging). */
export function generateStraightRoad(segmentCount: number): GeneratedRoad {
  const builder = new RoadBuilder();
  builder.addStraight(segmentCount);
  return builder.build();
}

/**
 * The Phase 4 road recipe (plan §11.3): city start → right curve →
 * elevated hill and S-curves → long elevated left curve → downhill
 * into a tunnel → riverside curve → back into the city.
 *
 * Geometry is identical to the Phase 2 recipe — curvature stays
 * exactly balanced (Σcurve = 0) and height returns to zero so the
 * loop joins without discontinuity; only the zone assignments were
 * added. The tunnel covers the whole dip so the climb out of the
 * valley fades from the tunnel mouth (zone seams never change the
 * road surface itself).
 */
export function buildDefaultRoad(): GeneratedRoad {
  const builder = new RoadBuilder();
  builder
    .addStraight(20)
    .addCurve(10, 20, 10, 0.35)
    .addZone("elevated")
    .addHill(20, 40, 20, 1200)
    .addSCurves()
    .addCurve(15, 30, 15, -0.5)
    .addZone("tunnel")
    .addHill(20, 40, 20, -800)
    .addZone("riverside")
    .addCurve(10, 20, 10, 0.4)
    .addZone("city")
    .addStraight(20);
  return builder.build();
}

/** Length of the loop in world units. */
export function roadTotalLength(segments: RoadSegment[]): number {
  return segments.length * gameConfig.segmentLength;
}

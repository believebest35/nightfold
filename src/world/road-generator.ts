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
 * The Phase 2 MVP road recipe:
 * straight → right curve (uphill approach) → hill → S-curves →
 * long left curve → dip → balancing right curve → straight.
 *
 * Curvature is exactly balanced (Σcurve = 0) and height returns to
 * zero, so the loop joins without visual discontinuity.
 */
export function buildDefaultRoad(): GeneratedRoad {
  const builder = new RoadBuilder();
  builder
    .addStraight(20)
    .addCurve(10, 20, 10, 0.35)
    .addHill(20, 40, 20, 1200)
    .addSCurves()
    .addCurve(15, 30, 15, -0.5)
    .addHill(20, 40, 20, -800)
    .addCurve(10, 20, 10, 0.4)
    .addStraight(20);
  return builder.build();
}

/** Length of the loop in world units. */
export function roadTotalLength(segments: RoadSegment[]): number {
  return segments.length * gameConfig.segmentLength;
}

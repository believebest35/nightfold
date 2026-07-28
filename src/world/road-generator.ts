import type { RoadSegment, RoadPoint, SceneryObject } from "../model/types.ts";
import { gameConfig } from "../config/game-config.ts";

/**
 * Generate a flat, straight, looping road for Phase 1.
 *
 * All segments share worldY = 0, curve = 0, and city zone.
 * The road is a simple closed loop — the camera wraps around
 * when it exceeds totalLength.
 */
export interface GeneratedRoad {
  segments: RoadSegment[];
  totalLength: number;
}

export function generateStraightRoad(segmentCount: number): GeneratedRoad {
  const segments: RoadSegment[] = [];

  for (let i = 0; i < segmentCount; i++) {
    const zStart = i * gameConfig.segmentLength;
    const zEnd = zStart + gameConfig.segmentLength;

    const p1: RoadPoint = {
      world: { worldX: 0, worldY: 0, worldZ: zStart },
    };
    const p2: RoadPoint = {
      world: { worldX: 0, worldY: 0, worldZ: zEnd },
    };

    segments.push({
      index: i,
      p1,
      p2,
      curve: 0,
      zone: "city",
      colorVariant: (i % 2) as 0 | 1,
      scenery: [] as SceneryObject[],
    });
  }

  return {
    segments,
    totalLength: segmentCount * gameConfig.segmentLength,
  };
}

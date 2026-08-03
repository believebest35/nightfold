import type { RoadSegment, SceneryObject, SceneryKind } from "../model/types.ts";
import { SeededRandom } from "./seeded-random.ts";
import { gameConfig } from "../config/game-config.ts";

// Streetlight every N segments, alternating sides.
const STREETLIGHT_INTERVAL = 6;
// Guardrail support posts every N segments, both sides (the continuous
// ribbon itself is drawn by the road renderer).
const GUARDRAIL_INTERVAL = 4;
// Building generation probability per attempted segment.
const BUILDING_CHANCE = 0.55;

/** Building height variants (world units) — at least 3 silhouettes per kind. */
const BUILDING_HEIGHTS = [1800, 3200, 5200, 7600] as const;

/**
 * Populate every segment's scenery array deterministically from a seed.
 *
 * Small regular objects (streetlights, guardrail posts) appear on a
 * fixed cadence; large objects (buildings) appear probabilistically but
 * are fully determined by the seed. Each segment holds at most 3 objects.
 */
export function attachScenery(segments: RoadSegment[], seed: number): void {
  const rng = new SeededRandom(seed);

  for (const seg of segments) {
    const objects: SceneryObject[] = [];

    // Guardrail support posts: every GUARDRAIL_INTERVAL segments, both sides.
    if (seg.index % GUARDRAIL_INTERVAL === 0) {
      objects.push(makeObject(seg.index, "guardrail", "left", rng));
      objects.push(makeObject(seg.index, "guardrail", "right", rng));
    }

    // Streetlight: one per STREETLIGHT_INTERVAL segments, alternating sides.
    if (seg.index % STREETLIGHT_INTERVAL === 0) {
      const side = seg.index % (STREETLIGHT_INTERVAL * 2) < STREETLIGHT_INTERVAL
        ? "left"
        : "right";
      objects.push(makeObject(seg.index, "streetlight", side, rng));
    }

    // Buildings: city segments only, at most one per segment. Which side
    // is attempted is seeded, so long-term density stays symmetric (a
    // fixed left-first order would starve the right side once the 3-object
    // cap is reached).
    if (seg.zone === "city" && objects.length < 3) {
      const side = rng.chance(0.5) ? "left" : "right";
      if (rng.chance(BUILDING_CHANCE)) {
        objects.push(makeObject(seg.index, "building", side, rng));
      }
    }

    seg.scenery = objects;
  }
}

function makeObject(
  segmentIndex: number,
  kind: SceneryKind,
  side: "left" | "right",
  rng: SeededRandom,
): SceneryObject {
  switch (kind) {
    case "streetlight": {
      return {
        id: `s${segmentIndex}-streetlight-${side}`,
        kind,
        segmentIndex,
        side,
        offset: gameConfig.roadHalfWidth + rng.range(350, 550),
        width: 120,
        height: rng.range(2000, 2600),
        colorVariant: 0,
      };
    }
    case "building": {
      // The inner edge (offset - width/2) must clear the shoulder
      // (roadHalfWidth × 1.4) with a safety gap, no matter the width.
      const width = rng.range(900, 2600);
      const shoulderEdge = gameConfig.roadHalfWidth * 1.4;
      const offset = shoulderEdge + width / 2 + rng.range(150, 500);
      return {
        id: `s${segmentIndex}-building-${side}`,
        kind,
        segmentIndex,
        side,
        offset,
        width,
        height: rng.pick(BUILDING_HEIGHTS) + rng.range(-300, 300),
        colorVariant: rng.int(0, 1),
      };
    }
    case "guardrail": {
      return {
        id: `s${segmentIndex}-guardrail-${side}`,
        kind,
        segmentIndex,
        side,
        offset: gameConfig.roadHalfWidth * 1.4 + 50,
        width: 60,
        height: rng.range(350, 500),
        colorVariant: 0,
      };
    }
    default:
      throw new Error(`unhandled scenery kind: ${kind}`);
  }
}

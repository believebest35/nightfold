import type { RoadSegment, SceneryObject, SceneryKind } from "../model/types.ts";
import { SeededRandom } from "./seeded-random.ts";
import { gameConfig } from "../config/game-config.ts";

// Streetlight every N segments, alternating sides.
const STREETLIGHT_INTERVAL = 6;
// Guardrail every segment, both sides.
const GUARDRAIL_INTERVAL = 1;
// Building generation probability per side.
const BUILDING_CHANCE = 0.55;

/** Building height variants (world units) — at least 3 silhouettes per kind. */
const BUILDING_HEIGHTS = [1800, 3200, 5200, 7600] as const;

/**
 * Populate every segment's scenery array deterministically from a seed.
 *
 * Small regular objects (streetlights, guardrails) appear on a fixed
 * cadence; large objects (buildings) appear probabilistically but are
 * fully determined by the seed. Each segment holds at most 3 objects.
 */
export function attachScenery(segments: RoadSegment[], seed: number): void {
  const rng = new SeededRandom(seed);

  for (const seg of segments) {
    const objects: SceneryObject[] = [];

    // Guardrail: every segment, both sides, close to the shoulder.
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

    // Buildings: city segments only, one per side with some probability.
    // Cap total objects per segment at 3 (plan §12.5): guardrails use 2
    // slots, so streetlight segments (3 used) leave no room for a building.
    if (seg.zone === "city") {
      for (const side of ["left", "right"] as const) {
        if (objects.length >= 3) break;
        if (rng.chance(BUILDING_CHANCE)) {
          objects.push(makeObject(seg.index, "building", side, rng));
        }
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
        height: rng.range(3200, 4000),
        colorVariant: 0,
      };
    }
    case "building": {
      return {
        id: `s${segmentIndex}-building-${side}`,
        kind,
        segmentIndex,
        side,
        offset: gameConfig.roadHalfWidth * 1.4 + rng.range(200, 1400),
        width: rng.range(900, 2600),
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
        offset: gameConfig.roadHalfWidth * 1.45 + 60,
        width: 80,
        height: 600,
        colorVariant: 0,
      };
    }
    default:
      throw new Error(`unhandled scenery kind: ${kind}`);
  }
}

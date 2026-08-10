import type { RoadSegment, SceneryObject, SceneryKind, RoadZone } from "../model/types.ts";
import { SeededRandom } from "./seeded-random.ts";
import { gameConfig } from "../config/game-config.ts";

// Streetlight every N segments, alternating sides.
const STREETLIGHT_INTERVAL = 6;
// Guardrail support posts every N segments, both sides (the continuous
// ribbon itself is drawn by the road renderer).
const GUARDRAIL_INTERVAL = 4;
// Elevated rails relax the post cadence so the low building layer has
// room inside the 3-object budget.
const ELEVATED_GUARDRAIL_INTERVAL = 8;
// Building generation probability per attempted segment.
const BUILDING_CHANCE = 0.55;
// The elevated low building layer is sparser than the city's towers.
const ELEVATED_BUILDING_CHANCE = 0.35;
// Bridge silhouette every N riverside segments (rare, large landmark).
const BRIDGE_INTERVAL = 30;

/** Building height variants (world units) — at least 3 silhouettes per kind. */
const BUILDING_HEIGHTS = [1800, 3200, 5200, 7600] as const;

/** A contiguous zone run in circular segment-array coordinates. */
export interface ZoneRun {
  /** Array position of the first segment at the zone entrance. */
  start: number;
  /** Array position of the last segment at the zone exit. */
  end: number;
  /** True when the run continues from the array end back to index 0. */
  wraps: boolean;
  /** Number of segments in the run, including both boundaries. */
  length: number;
  /** True when the whole circular road belongs to this zone. */
  closed?: boolean;
}

export interface ZoneRunDistances {
  /** Number of segments travelled from the run entrance. */
  entryDist: number;
  /** Number of segments remaining until the run exit segment. */
  exitDist: number;
}

function guardrailInterval(zone: RoadZone): number {
  return zone === "elevated" ? ELEVATED_GUARDRAIL_INTERVAL : GUARDRAIL_INTERVAL;
}

/**
 * Populate every segment's scenery array deterministically from a seed.
 *
 * Small regular objects (streetlights, guardrail posts) appear on a
 * fixed cadence; large objects (buildings) appear probabilistically but
 * are fully determined by the seed. Each segment holds at most 3 objects.
 */
export function attachScenery(segments: RoadSegment[], seed: number): void {
  const rng = new SeededRandom(seed);
  const tunnelRuns = findZoneRuns(segments, "tunnel");
  const riverRuns = findZoneRuns(segments, "riverside");

  for (let position = 0; position < segments.length; position++) {
    const seg = segments[position];
    if (!seg) continue;
    const objects: SceneryObject[] = [];
    const tunnelRun = seg.zone === "tunnel"
      ? findRunForIndex(tunnelRuns, position, segments.length)
      : undefined;
    const riverRun = seg.zone === "riverside"
      ? findRunForIndex(riverRuns, position, segments.length)
      : undefined;
    // Guardrail support posts: every guardrailInterval segments, both
    // sides. Tunnel walls and the river bank replace them where the
    // road runs inside or beside water. Transition posts are rendered as
    // road geometry so they keep this cadence without consuming a scenery
    // object slot alongside a river, bridge, or streetlight.
    if (
      seg.zone !== "tunnel" &&
      seg.zone !== "riverside" &&
      seg.index % guardrailInterval(seg.zone) === 0
    ) {
      objects.push(makeObject(seg.index, "guardrail", "left", rng));
      objects.push(makeObject(seg.index, "guardrail", "right", rng));
    }

    // Streetlight: one per STREETLIGHT_INTERVAL segments, alternating
    // sides. Inside tunnels the frames carry the warm lights instead.
    if (seg.zone !== "tunnel" && seg.index % STREETLIGHT_INTERVAL === 0) {
      // The river occupies the left bank, so riverside lights stay on the
      // dry right bank instead of alternating into the water.
      const side = seg.zone === "riverside"
        ? "right"
        : seg.index % (STREETLIGHT_INTERVAL * 2) < STREETLIGHT_INTERVAL
          ? "left"
          : "right";
      objects.push(makeObject(seg.index, "streetlight", side, rng));
    }

    // Tunnel: every segment carries one mask/frame object; entryDist and
    // exitDist (in segments) drive the fade so entering and leaving the
    // tunnel never snaps the whole screen dark or bright in one frame.
    if (seg.zone === "tunnel" && tunnelRun) {
      objects.push(makeTunnelFrame(seg.index, tunnelRun, position, segments.length));
    }

    // Riverside: the river hugs the left bank for the whole run, with
    // the same seam fades as the tunnel; a rare bridge silhouette
    // crosses it (plan §12.4).
    if (seg.zone === "riverside" && riverRun) {
      objects.push(makeRiver(seg.index, riverRun, position, segments.length));
      if (seg.index % BRIDGE_INTERVAL === 0) {
        objects.push(makeBridge(seg.index));
      }
    }

    // Buildings, at most one per segment. Which side is attempted is
    // seeded, so long-term density stays symmetric (a fixed left-first
    // order would starve the right side once the 3-object cap is reached).
    if (seg.zone === "city" && objects.length < 3) {
      const side = rng.chance(0.5) ? "left" : "right";
      if (rng.chance(BUILDING_CHANCE)) {
        objects.push(makeCityBuilding(seg.index, side, rng));
      }
    } else if (seg.zone === "elevated" && objects.length < 3) {
      const side = rng.chance(0.5) ? "left" : "right";
      if (rng.chance(ELEVATED_BUILDING_CHANCE)) {
        objects.push(makeElevatedBuilding(seg.index, side, rng));
      }
    }

    seg.scenery = objects;
  }
}

/** Dense city towers flanking the street (plan §12.1). */
function makeCityBuilding(
  segmentIndex: number,
  side: "left" | "right",
  rng: SeededRandom,
): SceneryObject {
  // The inner edge (offset - width/2) must clear the shoulder
  // (roadHalfWidth × 1.4) with a safety gap, no matter the width.
  const width = rng.range(900, 2600);
  const shoulderEdge = gameConfig.roadHalfWidth * 1.4;
  const offset = shoulderEdge + width / 2 + rng.range(150, 500);
  return {
    id: `s${segmentIndex}-building-${side}`,
    kind: "building",
    segmentIndex,
    side,
    offset,
    width,
    height: rng.pick(BUILDING_HEIGHTS) + rng.range(-300, 300),
    colorVariant: rng.int(0, 1),
  };
}

/**
 * Consecutive runs of segments in `zone`, used to compute fade distances for
 * zone-spanning scenery. A run that wraps the loop boundary is represented
 * explicitly instead of as an impossible start > end interval.
 */
export function findZoneRuns(segments: RoadSegment[], zone: RoadZone): ZoneRun[] {
  const linearRuns: ZoneRun[] = [];
  let start = -1;
  for (let i = 0; i <= segments.length; i++) {
    const inZone = i < segments.length && segments[i]?.zone === zone;
    if (inZone && start < 0) start = i;
    if (!inZone && start >= 0) {
      linearRuns.push({
        start,
        end: i - 1,
        wraps: false,
        length: i - start,
      });
      start = -1;
    }
  }

  if (linearRuns.length === 1) {
    const only = linearRuns[0];
    if (only?.start === 0 && only.end === segments.length - 1) {
      // There is no entrance or exit on an all-zone loop. Treat it as a
      // closed run so the array boundary cannot create a fake bright seam.
      return [{
        start: 0,
        end: segments.length - 1,
        wraps: true,
        length: segments.length,
        closed: true,
      }];
    }
  }
  if (linearRuns.length < 2) return linearRuns;

  const first = linearRuns[0];
  const last = linearRuns[linearRuns.length - 1];
  if (first?.start === 0 && last?.end === segments.length - 1) {
    const wrapped: ZoneRun = {
      start: last.start,
      end: first.end,
      wraps: true,
      length: last.length + first.length,
    };
    return [wrapped, ...linearRuns.slice(1, -1)];
  }
  return linearRuns;
}

export function findRunForIndex(
  runs: ZoneRun[],
  index: number,
  segmentCount: number,
): ZoneRun | undefined {
  if (segmentCount <= 0) return undefined;
  const normalized = ((index % segmentCount) + segmentCount) % segmentCount;
  return runs.find((run) => run.wraps
    ? normalized >= run.start || normalized <= run.end
    : normalized >= run.start && normalized <= run.end);
}

/** Return circular distances for a segment known to belong to `run`. */
export function getZoneRunDistances(
  run: ZoneRun,
  index: number,
  segmentCount: number,
): ZoneRunDistances | undefined {
  const matched = findRunForIndex([run], index, segmentCount);
  if (!matched) return undefined;

  if (run.closed) {
    return { entryDist: run.length, exitDist: run.length };
  }

  const normalized = ((index % segmentCount) + segmentCount) % segmentCount;
  const entryDist = run.wraps
    ? normalized >= run.start
      ? normalized - run.start
      : segmentCount - run.start + normalized
    : normalized - run.start;
  return {
    entryDist,
    exitDist: run.length - 1 - entryDist,
  };
}

/** One tunnel segment's wall/ceiling mask plus structural frame slot. */
function makeTunnelFrame(
  segmentIndex: number,
  run: ZoneRun,
  position: number,
  segmentCount: number,
): SceneryObject {
  const distances = getZoneRunDistances(run, position, segmentCount);
  if (!distances) throw new Error(`segment ${position} is outside tunnel run`);
  return {
    id: `s${segmentIndex}-tunnel-frame`,
    kind: "tunnel-frame",
    segmentIndex,
    side: "left",
    offset: gameConfig.roadHalfWidth * 1.5,
    width: 400,
    height: 2600,
    colorVariant: 0,
    entryDist: distances.entryDist,
    exitDist: distances.exitDist,
    closedRun: run.closed,
  };
}

/** The dark river surface on the left bank (plan §12.4). */
function makeRiver(
  segmentIndex: number,
  run: ZoneRun,
  position: number,
  segmentCount: number,
): SceneryObject {
  const distances = getZoneRunDistances(run, position, segmentCount);
  if (!distances) throw new Error(`segment ${position} is outside riverside run`);
  // The bank (inner edge = offset - width/2) sits just outside the
  // shoulder; the river then stretches away from the road.
  const bank = gameConfig.roadHalfWidth * 1.5;
  const width = 4000;
  return {
    id: `s${segmentIndex}-river`,
    kind: "river",
    segmentIndex,
    side: "left",
    offset: bank + width / 2,
    width,
    height: 0,
    colorVariant: 0,
    entryDist: distances.entryDist,
    exitDist: distances.exitDist,
    closedRun: run.closed,
  };
}

/** A rare distant bridge silhouette crossing the river. */
function makeBridge(segmentIndex: number): SceneryObject {
  return {
    id: `s${segmentIndex}-bridge`,
    kind: "bridge",
    segmentIndex,
    side: "left",
    offset: gameConfig.roadHalfWidth * 1.5 + 800,
    width: 5000,
    height: 900,
    colorVariant: 0,
  };
}

/** Low, sparse building layer below the viaduct (plan §12.2). */
function makeElevatedBuilding(
  segmentIndex: number,
  side: "left" | "right",
  rng: SeededRandom,
): SceneryObject {
  const width = rng.range(700, 1800);
  const shoulderEdge = gameConfig.roadHalfWidth * 1.4;
  const offset = shoulderEdge + width / 2 + rng.range(600, 1400);
  return {
    id: `s${segmentIndex}-building-${side}`,
    kind: "building",
    segmentIndex,
    side,
    offset,
    width,
    // Low layer: noticeably shorter than city towers, pushed farther
    // from the road, and always the far (darker) silhouette color.
    height: rng.range(800, 1800),
    colorVariant: 1,
  };
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

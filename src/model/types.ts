export interface WorldPoint {
  worldX: number;
  worldY: number;
  worldZ: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
  halfWidth: number;
  scale: number;
  clipY: number;
}

export interface RoadPoint {
  world: WorldPoint;
  screen?: ScreenPoint;
}

export type RoadZone = "city" | "elevated" | "tunnel" | "riverside";

export interface RoadSegment {
  index: number;
  p1: RoadPoint;
  p2: RoadPoint;
  curve: number;
  zone: RoadZone;
  colorVariant: 0 | 1;
  scenery: SceneryObject[];
}

export type SceneryKind =
  | "building"
  | "streetlight"
  | "guardrail"
  | "sign"
  | "tunnel-frame"
  | "river"
  | "bridge";

export interface SceneryObject {
  id: string;
  kind: SceneryKind;
  segmentIndex: number;
  side: "left" | "right";
  offset: number;
  width: number;
  height: number;
  colorVariant: number;
  /**
   * For zone-spanning kinds (tunnel-frame, river): distance in segments
   * from the zone entrance, and from this segment to the zone exit.
   * Renders fade in/out across the seams so zone transitions never pop.
   */
  entryDist?: number;
  exitDist?: number;
}

export interface InputState {
  accelerate: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
}

export interface GameState {
  positionZ: number;
  speed: number;
  playerX: number;
  distanceTravelled: number;
  paused: boolean;
  elapsedSeconds: number;
}

export interface RenderContext {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
}

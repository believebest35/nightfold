import { describe, it, expect } from "vitest";
import {
  projectWorldPoint,
  computeCameraDepth,
  isInFrontOfCamera,
  type ProjectionParams,
} from "../render/projection.ts";
import type { WorldPoint } from "../model/types.ts";

function makeParams(overrides: Partial<ProjectionParams> = {}): ProjectionParams {
  return {
    cameraX: 0,
    cameraY: 900,
    cameraZ: 1000,
    cameraDepth: 1, // fov = 90
    screenWidth: 1280,
    screenHeight: 720,
    roadHalfWidth: 1000,
    ...overrides,
  };
}

describe("computeCameraDepth", () => {
  it("returns 1 for 90-degree FOV", () => {
    // tan(45°) = 1, so 1/1 = 1
    expect(computeCameraDepth(90)).toBeCloseTo(1, 5);
  });

  it("returns smaller depth for wider FOV", () => {
    const depth60 = computeCameraDepth(60);
    const depth120 = computeCameraDepth(120);
    // Wider FOV → smaller camera depth
    expect(depth120).toBeLessThan(depth60);
  });

  it("returns larger depth for narrower FOV", () => {
    const depth30 = computeCameraDepth(30);
    const depth90 = computeCameraDepth(90);
    // Narrower FOV → larger camera depth
    expect(depth30).toBeGreaterThan(depth90);
  });
});

describe("projectWorldPoint", () => {
  it("projects a point directly ahead to screen center", () => {
    const world: WorldPoint = { worldX: 0, worldY: 0, worldZ: 2000 };
    const params = makeParams();
    const result = projectWorldPoint(world, params);

    // X should be at screen center
    expect(result.x).toBeCloseTo(640, 1);
    // Y should be in the lower portion (road is below camera)
    expect(result.y).toBeGreaterThan(360);
    // scale should be positive
    expect(result.scale).toBeGreaterThan(0);
    // halfWidth should be positive
    expect(result.halfWidth).toBeGreaterThan(0);
  });

  it("gives larger halfWidth for nearer points", () => {
    const farWorld: WorldPoint = { worldX: 0, worldY: 0, worldZ: 10000 };
    const nearWorld: WorldPoint = { worldX: 0, worldY: 0, worldZ: 2000 };
    const params = makeParams();

    const far = projectWorldPoint(farWorld, params);
    const near = projectWorldPoint(nearWorld, params);

    expect(near.halfWidth).toBeGreaterThan(far.halfWidth);
    expect(near.scale).toBeGreaterThan(far.scale);
  });

  it("handles point at camera position without NaN", () => {
    const world: WorldPoint = { worldX: 0, worldY: 900, worldZ: 1000 };
    const params = makeParams({ cameraZ: 1000, cameraY: 900 });
    const result = projectWorldPoint(world, params);

    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(Number.isFinite(result.halfWidth)).toBe(true);
    expect(Number.isFinite(result.scale)).toBe(true);
    expect(result.halfWidth).toBeGreaterThanOrEqual(0);
  });

  it("handles point behind camera without NaN", () => {
    const world: WorldPoint = { worldX: 0, worldY: 0, worldZ: 500 };
    const params = makeParams({ cameraZ: 1000 });
    const result = projectWorldPoint(world, params);

    expect(Number.isFinite(result.x)).toBe(true);
    expect(Number.isFinite(result.y)).toBe(true);
    expect(Number.isFinite(result.halfWidth)).toBe(true);
    expect(result.halfWidth).toBeGreaterThanOrEqual(0);
  });

  it("projects laterally offset points correctly", () => {
    const leftWorld: WorldPoint = { worldX: -500, worldY: 0, worldZ: 2000 };
    const rightWorld: WorldPoint = { worldX: 500, worldY: 0, worldZ: 2000 };
    const params = makeParams();

    const left = projectWorldPoint(leftWorld, params);
    const right = projectWorldPoint(rightWorld, params);

    expect(left.x).toBeLessThan(640);
    expect(right.x).toBeGreaterThan(640);
    // Symmetric around center
    expect(left.x - 640).toBeCloseTo(-(right.x - 640), 0);
  });

  it("never returns negative halfWidth", () => {
    const world: WorldPoint = { worldX: 0, worldY: 0, worldZ: 500 };
    const params = makeParams({ cameraZ: 1000 });
    const result = projectWorldPoint(world, params);
    expect(result.halfWidth).toBeGreaterThanOrEqual(0);
  });
});

describe("isInFrontOfCamera", () => {
  it("returns true for points ahead", () => {
    expect(isInFrontOfCamera(500, 0.1)).toBe(true);
  });

  it("returns false for points behind or at near clip", () => {
    expect(isInFrontOfCamera(0, 0.1)).toBe(false);
    expect(isInFrontOfCamera(-100, 0.1)).toBe(false);
  });
});

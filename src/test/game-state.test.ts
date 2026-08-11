import { describe, it, expect } from "vitest";
import { createInitialGameState } from "../model/game-state.ts";

describe("createInitialGameState", () => {
  it("returns a zeroed game state", () => {
    const state = createInitialGameState();
    expect(state.positionZ).toBe(0);
    expect(state.speed).toBe(0);
    expect(state.playerX).toBe(0);
    expect(state.distanceTravelled).toBe(0);
    expect(state.weatherIntensity).toBeGreaterThan(0);
    expect(state.weatherIntensity).toBeLessThanOrEqual(1);
    expect(state.braking).toBe(false);
    expect(state.paused).toBe(false);
    expect(state.elapsedSeconds).toBe(0);
  });
});

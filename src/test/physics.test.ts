import { describe, it, expect } from "vitest";
import { updateDriving } from "../core/physics.ts";
import { createInitialGameState } from "../model/game-state.ts";
import type { GameState, InputState } from "../model/types.ts";
import { gameConfig } from "../config/game-config.ts";

const DT = 1 / 60;

function makeState(): GameState {
  return createInitialGameState();
}

function makeInput(partial: Partial<InputState> = {}): InputState {
  return {
    accelerate: false,
    brake: false,
    steerLeft: false,
    steerRight: false,
    ...partial,
  };
}

describe("updateDriving — speed", () => {
  it("accelerates toward maxSpeed but never exceeds it", () => {
    const state = makeState();
    const input = makeInput({ accelerate: true });
    for (let i = 0; i < 60 * 10; i++) {
      updateDriving(state, input, 0, DT);
    }
    expect(state.speed).toBeLessThanOrEqual(gameConfig.maxSpeed);
    expect(state.speed).toBeCloseTo(gameConfig.maxSpeed, 0);
  });

  it("brakes toward zero but never goes negative", () => {
    const state = makeState();
    state.speed = gameConfig.maxSpeed;
    const input = makeInput({ brake: true });
    for (let i = 0; i < 60 * 20; i++) {
      updateDriving(state, input, 0, DT);
    }
    expect(state.speed).toBeGreaterThanOrEqual(0);
  });

  it("decelerates naturally with no input", () => {
    const state = makeState();
    state.speed = 6000;
    updateDriving(state, makeInput(), 0, DT);
    expect(state.speed).toBeLessThan(6000);
    expect(state.speed).toBeGreaterThan(0);
  });

  it("is frame-rate independent", () => {
    const input = makeInput({ accelerate: true });
    const stateA = makeState();
    const stateB = makeState();
    // 60 small steps vs 1 large step (same total time)
    for (let i = 0; i < 60; i++) {
      updateDriving(stateA, input, 0, DT);
    }
    updateDriving(stateB, input, 0, 1);
    expect(stateA.speed).toBeCloseTo(stateB.speed, 3);
  });
});

describe("updateDriving — steering", () => {
  it("steers right on right input", () => {
    const state = makeState();
    updateDriving(state, makeInput({ steerRight: true }), 0, DT);
    expect(state.playerX).toBeGreaterThan(0);
  });

  it("steers left on left input", () => {
    const state = makeState();
    updateDriving(state, makeInput({ steerLeft: true }), 0, DT);
    expect(state.playerX).toBeLessThan(0);
  });

  it("does not drift when keys are released", () => {
    const state = makeState();
    updateDriving(state, makeInput({ steerRight: true }), 0, DT);
    const before = state.playerX;
    updateDriving(state, makeInput(), 0, DT);
    expect(state.playerX).toBe(before);
  });

  it("clamps playerX to [-2, 2]", () => {
    const state = makeState();
    const input = makeInput({ steerRight: true });
    for (let i = 0; i < 60 * 10; i++) {
      updateDriving(state, input, 0, DT);
    }
    expect(state.playerX).toBeLessThanOrEqual(2);
  });
});

describe("updateDriving — centrifugal drift", () => {
  it("pushes player to the left on a right turn", () => {
    const state = makeState();
    state.speed = gameConfig.maxSpeed / 2;
    updateDriving(state, makeInput(), 0.3, DT);
    expect(state.playerX).toBeLessThan(0);
  });

  it("pushes player to the right on a left turn", () => {
    const state = makeState();
    state.speed = gameConfig.maxSpeed / 2;
    updateDriving(state, makeInput(), -0.3, DT);
    expect(state.playerX).toBeGreaterThan(0);
  });

  it("has no effect at zero speed", () => {
    const state = makeState();
    updateDriving(state, makeInput(), 0.5, DT);
    expect(state.playerX).toBe(0);
  });
});

describe("updateDriving — off-road penalty", () => {
  it("slows the car when |playerX| > 1", () => {
    const state = makeState();
    state.speed = gameConfig.maxSpeed / 2;
    state.playerX = 1.5;
    updateDriving(state, makeInput(), 0, DT);
    expect(state.speed).toBeLessThan(gameConfig.maxSpeed / 2);
  });

  it("does not penalize on the road", () => {
    const state = makeState();
    state.speed = gameConfig.maxSpeed / 2;
    state.playerX = 0.8;
    updateDriving(state, makeInput(), 0, DT);
    // Only natural deceleration applies on the road.
    expect(state.speed).toBeCloseTo(
      gameConfig.maxSpeed / 2 - gameConfig.naturalDeceleration * DT,
      6,
    );
  });
});

describe("updateDriving — progression", () => {
  it("advances positionZ and distanceTravelled by the updated speed * dt", () => {
    const state = makeState();
    state.speed = 1000;
    const zBefore = state.positionZ;
    const dBefore = state.distanceTravelled;
    updateDriving(state, makeInput(), 0, DT);
    // Natural deceleration happens before advancing, so the position
    // advance uses the speed after this frame's deceleration.
    expect(state.positionZ - zBefore).toBeCloseTo(state.speed * DT);
    expect(state.distanceTravelled - dBefore).toBeCloseTo(state.speed * DT);
  });
});

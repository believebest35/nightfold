import type { GameState, InputState } from "../model/types.ts";
import { gameConfig } from "../config/game-config.ts";

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Pure driving simulation, one fixed timestep per call.
 * Order follows the plan (§10.2):
 * speed → steering → centrifugal drift → off-road penalty → advance.
 *
 * @param roadCurveAtPlayer  curvature of the segment the player is on
 *                           (positive = right turn). Drives centrifugal drift.
 */
export function updateDriving(
  state: GameState,
  input: InputState,
  roadCurveAtPlayer: number,
  dt: number,
): void {
  const cfg = gameConfig;

  // 1. Speed: accelerate, brake, or natural deceleration.
  if (input.accelerate) {
    state.speed += cfg.acceleration * dt;
  } else if (input.brake) {
    state.speed -= cfg.braking * dt;
  } else {
    state.speed -= cfg.naturalDeceleration * dt;
  }
  state.speed = clamp(state.speed, 0, cfg.maxSpeed);

  // 2. Steering. playerX is normalized: road edges at ±1, hard limit ±2.
  const steerDirection = (input.steerRight ? 1 : 0) - (input.steerLeft ? 1 : 0);
  state.playerX += steerDirection * cfg.steeringRate * dt;

  // 3. Centrifugal drift: on a right turn (curve > 0) the player is
  //    pushed toward the outside, i.e. left (-x). Normalized by maxSpeed
  //    so the effect scales with how fast the car is moving.
  state.playerX -= roadCurveAtPlayer * (state.speed / cfg.maxSpeed) * cfg.centrifugalForce * dt;

  // 4. Off-road penalty: leaving the asphalt (|playerX| > 1) slows the car.
  if (Math.abs(state.playerX) > 1) {
    state.speed = Math.max(state.speed - cfg.offRoadDeceleration * dt, 0);
  }

  state.playerX = clamp(state.playerX, -2, 2);

  // 5. Advance along the road.
  state.positionZ += state.speed * dt;
  state.distanceTravelled += state.speed * dt;
}

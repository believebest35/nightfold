import type { GameState } from "./types.ts";

export function createInitialGameState(): GameState {
  return {
    positionZ: 0,
    speed: 0,
    playerX: 0,
    distanceTravelled: 0,
    paused: false,
    elapsedSeconds: 0,
  };
}

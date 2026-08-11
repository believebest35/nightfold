import type { GameState } from "./types.ts";
import { gameConfig } from "../config/game-config.ts";

export function createInitialGameState(): GameState {
  return {
    positionZ: 0,
    speed: 0,
    playerX: 0,
    distanceTravelled: 0,
    weatherIntensity: gameConfig.weatherIntensity,
    braking: false,
    paused: false,
    elapsedSeconds: 0,
  };
}

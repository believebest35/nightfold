import { gameConfig } from "../config/game-config.ts";

export type UpdateFn = (dt: number) => void;
export type RenderFn = (alpha: number) => void;

interface GameLoopState {
  lastTime: number;
  accumulator: number;
  rafId: number;
}

/**
 * Fixed-timestep game loop using requestAnimationFrame.
 *
 * - Caps frame delta to avoid spiral-of-death after tab switch.
 * - Runs up to maxUpdatesPerFrame logic updates per render.
 * - Calls render() with an interpolation alpha in [0, 1].
 */
export function createGameLoop(update: UpdateFn, render: RenderFn) {
  const maxUpdatesPerFrame = 5;
  const maxFrameDelta = 0.25; // 250ms cap

  const state: GameLoopState = {
    lastTime: 0,
    accumulator: 0,
    rafId: 0,
  };

  function frame(now: number) {
    const rawDelta = (now - state.lastTime) / 1000;
    state.lastTime = now;

    // Cap delta to avoid huge jumps
    const delta = Math.min(rawDelta, maxFrameDelta);
    state.accumulator += delta;

    // Fixed-step updates
    let updates = 0;
    while (state.accumulator >= gameConfig.fixedTimeStep && updates < maxUpdatesPerFrame) {
      update(gameConfig.fixedTimeStep);
      state.accumulator -= gameConfig.fixedTimeStep;
      updates++;
    }

    // If we hit the max updates cap, discard remaining accumulator
    if (updates >= maxUpdatesPerFrame) {
      state.accumulator = 0;
    }

    // Interpolation alpha for render
    const alpha = state.accumulator / gameConfig.fixedTimeStep;
    render(alpha);

    state.rafId = requestAnimationFrame(frame);
  }

  return {
    start() {
      state.lastTime = performance.now();
      state.accumulator = 0;
      state.rafId = requestAnimationFrame(frame);
    },
    stop() {
      cancelAnimationFrame(state.rafId);
    },
  };
}

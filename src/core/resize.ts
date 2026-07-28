import { gameConfig } from "../config/game-config.ts";

export interface CanvasDimensions {
  width: number;
  height: number;
  dpr: number;
}

/**
 * Resize the canvas to fill the window, respecting devicePixelRatio cap.
 * Returns the logical dimensions and actual DPR used.
 */
export function resizeCanvas(canvas: HTMLCanvasElement): CanvasDimensions {
  const dpr = Math.min(window.devicePixelRatio || 1, gameConfig.maxDevicePixelRatio);
  const width = window.innerWidth;
  const height = window.innerHeight;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  return { width, height, dpr };
}

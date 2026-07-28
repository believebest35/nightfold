import { createGameLoop } from "./game-loop.ts";
import { setupInput, consumeKeyPress } from "./input.ts";
import { resizeCanvas } from "./resize.ts";
import { createInitialGameState } from "../model/game-state.ts";
import type { GameState, RenderContext } from "../model/types.ts";
import { palette } from "../config/palette.ts";

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameState: GameState;
  private renderCtx: RenderContext;
  private fpsFrames: number[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context not available");
    }
    this.ctx = ctx;
    this.gameState = createInitialGameState();

    const dims = resizeCanvas(this.canvas);
    this.renderCtx = {
      ctx: this.ctx,
      width: dims.width,
      height: dims.height,
      dpr: dims.dpr,
    };
  }

  start(): void {
    setupInput();
    window.addEventListener("resize", this.handleResize.bind(this));

    const loop = createGameLoop(
      (dt) => { this.update(dt); },
      (alpha) => { this.render(alpha); },
    );
    loop.start();
  }

  private handleResize(): void {
    const dims = resizeCanvas(this.canvas);
    this.renderCtx.width = dims.width;
    this.renderCtx.height = dims.height;
    this.renderCtx.dpr = dims.dpr;
  }

  private update(dt: number): void {
    // Toggle pause
    if (consumeKeyPress("p") || consumeKeyPress("escape")) {
      this.gameState.paused = !this.gameState.paused;
    }

    if (this.gameState.paused) {
      return;
    }

    this.gameState.elapsedSeconds += dt;
  }

  private render(_alpha: number): void {
    const { ctx, width, height, dpr } = this.renderCtx;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Clear with dark background
    ctx.fillStyle = palette.skyTop;
    ctx.fillRect(0, 0, width, height);

    // Draw debug text
    this.drawDebugOverlay(width, height);

    // Draw pause overlay
    if (this.gameState.paused) {
      this.drawPauseOverlay(width, height);
    }

    ctx.restore();
  }

  private drawDebugOverlay(width: number, _height: number): void {
    const { ctx } = this.renderCtx;
    const now = performance.now();

    // Track FPS
    this.fpsFrames.push(now);
    while (this.fpsFrames.length > 0) {
      const first = this.fpsFrames[0];
      if (first !== undefined && first < now - 1000) {
        this.fpsFrames.shift();
      } else {
        break;
      }
    }
    const fps = this.fpsFrames.length;

    ctx.save();
    ctx.font = "14px monospace";
    ctx.fillStyle = "#42d9e8";
    ctx.textBaseline = "top";

    const lines = [
      `FPS: ${fps}`,
      `Window: ${width}×${Math.round(window.innerHeight)}`,
      `DPR: ${window.devicePixelRatio}`,
      `Paused: ${this.gameState.paused ? "Yes" : "No"}`,
      `Time: ${this.gameState.elapsedSeconds.toFixed(1)}s`,
    ];

    lines.forEach((line, i) => {
      ctx.fillText(line, 12, 12 + i * 20);
    });

    ctx.restore();
  }

  private drawPauseOverlay(width: number, height: number): void {
    const { ctx } = this.renderCtx;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
    ctx.fillRect(0, 0, width, height);

    ctx.font = "48px monospace";
    ctx.fillStyle = "#d8d2b8";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PAUSED", width / 2, height / 2);
    ctx.restore();
  }
}

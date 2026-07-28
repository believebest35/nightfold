import { createGameLoop } from "./game-loop.ts";
import { setupInput, consumeKeyPress } from "./input.ts";
import { resizeCanvas } from "./resize.ts";
import { createInitialGameState } from "../model/game-state.ts";
import type { GameState, RenderContext } from "../model/types.ts";
import { gameConfig } from "../config/game-config.ts";
import { generateStraightRoad, type GeneratedRoad } from "../world/road-generator.ts";
import { getSegmentsAhead, getRoadYAtZ } from "../world/road-query.ts";
import { renderFrame, type RenderState } from "../render/renderer.ts";

/** Constant auto-drive speed for Phase 1 (half of maxSpeed). */
const AUTO_SPEED = gameConfig.maxSpeed / 2;

/** Number of segments in the loop. */
const SEGMENT_COUNT = 500;

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameState: GameState;
  private renderCtx: RenderContext;
  private fpsFrames: number[] = [];
  private road: GeneratedRoad;
  private debugMode = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context not available");
    }
    this.ctx = ctx;
    this.gameState = createInitialGameState();
    this.road = generateStraightRoad(SEGMENT_COUNT);

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
      (_alpha) => { this.render(); },
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

    // Toggle debug mode
    if (consumeKeyPress("`")) {
      this.debugMode = !this.debugMode;
    }

    if (this.gameState.paused) {
      return;
    }

    // Auto-drive: constant forward speed
    this.gameState.positionZ += AUTO_SPEED * dt;
    this.gameState.speed = AUTO_SPEED;
    this.gameState.distanceTravelled += AUTO_SPEED * dt;
    this.gameState.elapsedSeconds += dt;

    // Wrap position for loop
    this.gameState.positionZ =
      ((this.gameState.positionZ % this.road.totalLength) + this.road.totalLength) %
      this.road.totalLength;
  }

  private render(): void {
    const { ctx, width, height, dpr } = this.renderCtx;

    ctx.save();
    ctx.scale(dpr, dpr);

    // Main scene render
    const segmentsAhead = getSegmentsAhead(
      this.road.segments,
      this.road.totalLength,
      this.gameState.positionZ,
      gameConfig.drawDistance,
    );

    const roadY = getRoadYAtZ(
      this.road.segments,
      this.road.totalLength,
      this.gameState.positionZ,
    );

    const renderState: RenderState = {
      cameraX: 0,
      cameraY: roadY + gameConfig.cameraHeight,
      cameraZ: this.gameState.positionZ,
      debug: this.debugMode,
    };

    renderFrame(ctx, this.renderCtx, segmentsAhead, renderState);

    // Debug overlay on top
    this.drawDebugOverlay(width, height);

    // Pause overlay
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
      `Speed: ${Math.round(this.gameState.speed)}`,
      `PosZ: ${Math.round(this.gameState.positionZ)}`,
      `Dist: ${Math.round(this.gameState.distanceTravelled)}`,
      `Debug: ${this.debugMode ? "ON" : "OFF"} (\`)`,
      `Paused: ${this.gameState.paused ? "Yes" : "No"}`,
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

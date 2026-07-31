import { createGameLoop } from "./game-loop.ts";
import { setupInput, consumeKeyPress, readInput } from "./input.ts";
import { resizeCanvas } from "./resize.ts";
import { updateDriving } from "./physics.ts";
import { createInitialGameState } from "../model/game-state.ts";
import type { GameState, RenderContext } from "../model/types.ts";
import { gameConfig } from "../config/game-config.ts";
import { buildDefaultRoad, type GeneratedRoad } from "../world/road-generator.ts";
import {
  getSegmentsAhead,
  getRoadYAtZ,
  getRoadStateAtZ,
  findSegmentAtZ,
} from "../world/road-query.ts";
import { renderFrame, type RenderState } from "../render/renderer.ts";
import { SkyRenderer } from "../render/sky-renderer.ts";
import { attachScenery } from "../world/scenery-generator.ts";

/** Amplitude of the off-road screen shake, in logical pixels. */
const OFF_ROAD_SHAKE_MAX = 6;

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private gameState: GameState;
  private renderCtx: RenderContext;
  private fpsFrames: number[] = [];
  private road: GeneratedRoad;
  private sky: SkyRenderer;
  private debugMode = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas 2D context not available");
    }
    this.ctx = ctx;
    this.gameState = createInitialGameState();
    this.road = buildDefaultRoad();
    attachScenery(this.road.segments, gameConfig.worldSeed);
    this.sky = new SkyRenderer(gameConfig.worldSeed);

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

    // Reset to road center
    if (consumeKeyPress("r")) {
      this.gameState.playerX = 0;
    }

    // Toggle debug mode
    if (consumeKeyPress("`")) {
      this.debugMode = !this.debugMode;
    }

    if (this.gameState.paused) {
      return;
    }

    const input = readInput();
    const playerSegment = findSegmentAtZ(
      this.road.segments,
      this.road.totalLength,
      this.gameState.positionZ,
    );
    updateDriving(this.gameState, input, playerSegment?.curve ?? 0, dt);

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

    // Off-road shake: small horizontal offset growing with how far the
    // player has left the asphalt. Subtle, never screen-sickness level.
    if (Math.abs(this.gameState.playerX) > 1) {
      const depth = Math.abs(this.gameState.playerX) - 1;
      const shake = Math.min(depth * 8, OFF_ROAD_SHAKE_MAX) * Math.sign(this.gameState.playerX);
      ctx.translate(shake, 0);
    }

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

    const roadState = getRoadStateAtZ(
      this.road.segments,
      this.road.totalLength,
      this.gameState.positionZ,
    );

    const renderState: RenderState = {
      cameraY: roadY + gameConfig.cameraHeight,
      cameraZ: this.gameState.positionZ,
      playerX: this.gameState.playerX,
      roadOffsetRate: roadState.offsetRate,
      totalLength: this.road.totalLength,
      debug: this.debugMode,
    };

    renderFrame(ctx, this.renderCtx, segmentsAhead, renderState, this.sky);

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

    const speedPercent = Math.round((this.gameState.speed / gameConfig.maxSpeed) * 100);
    const offRoad = Math.abs(this.gameState.playerX) > 1;

    ctx.save();
    ctx.font = "14px monospace";
    ctx.fillStyle = "#42d9e8";
    ctx.textBaseline = "top";

    const lines = [
      `FPS: ${fps}`,
      `Window: ${width}×${Math.round(window.innerHeight)}`,
      `DPR: ${window.devicePixelRatio}`,
      `Speed: ${speedPercent}%`,
      `PosZ: ${Math.round(this.gameState.positionZ)}`,
      `Dist: ${Math.round(this.gameState.distanceTravelled)}`,
      `Debug: ${this.debugMode ? "ON" : "OFF"} (\`)`,
      `Paused: ${this.gameState.paused ? "Yes" : "No"}`,
    ];

    lines.forEach((line, i) => {
      ctx.fillText(line, 12, 12 + i * 20);
    });

    if (offRoad) {
      ctx.font = "bold 18px monospace";
      ctx.fillStyle = "#ff304f";
      ctx.fillText("OFF ROAD", 12, 12 + lines.length * 20 + 8);
    }

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

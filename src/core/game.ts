import { createGameLoop } from "./game-loop.ts";
import { setupInput, consumeKeyPress, readInput } from "./input.ts";
import { resizeCanvas } from "./resize.ts";
import { updateDriving } from "./physics.ts";
import { createInitialGameState } from "../model/game-state.ts";
import type { GameState, InputState, RenderContext } from "../model/types.ts";
import { gameConfig } from "../config/game-config.ts";
import { palette } from "../config/palette.ts";
import { colorRgba, parseHex } from "../render/fog.ts";
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
  /** Acceptance-test hook: ?autodrive=1 simulates a held accelerate key. */
  private autoDrive = false;

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

    // Debug/acceptance URL hooks: ?debug=1, ?z=nnn (initial position),
    // ?autodrive=1. Kept deliberately minimal — not part of the game UI.
    const query = new URLSearchParams(window.location.search);
    if (query.get("debug") === "1") {
      this.debugMode = true;
    }
    const startZ = Number(query.get("z"));
    if (Number.isFinite(startZ)) {
      this.gameState.positionZ =
        ((startZ % this.road.totalLength) + this.road.totalLength) % this.road.totalLength;
    }
    this.autoDrive = query.get("autodrive") === "1";

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

    const input: InputState = this.autoDrive
      ? { accelerate: true, brake: false, steerLeft: false, steerRight: false }
      : readInput();
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
    const offRoad = Math.abs(this.gameState.playerX) > 1;

    // ---- World layer (off-road shake affects the world and vehicle only) ----
    ctx.save();
    ctx.scale(dpr, dpr);
    if (offRoad) {
      const depth = Math.abs(this.gameState.playerX) - 1;
      const shake = Math.min(depth * 8, OFF_ROAD_SHAKE_MAX) * Math.sign(this.gameState.playerX);
      ctx.translate(shake, 0);
    }

    const segmentsAhead = getSegmentsAhead(
      this.road.segments,
      this.road.totalLength,
      this.gameState.positionZ,
      gameConfig.drawDistance,
    );

    const playerSegment = findSegmentAtZ(
      this.road.segments,
      this.road.totalLength,
      this.gameState.positionZ,
    );
    const segmentLength = gameConfig.segmentLength;
    const segmentProgress = playerSegment
      ? Math.min(
        Math.max(
          (this.gameState.positionZ - playerSegment.p1.world.worldZ) / segmentLength,
          0,
        ),
        1,
      )
      : 0;
    const zoneObject = playerSegment?.scenery.find((obj) =>
      obj.kind === "tunnel-frame" || obj.kind === "river",
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
      cameraZone: playerSegment?.zone ?? "city",
      cameraZoneEntryDist: zoneObject?.entryDist,
      cameraZoneExitDist: zoneObject?.exitDist,
      cameraSegmentProgress: segmentProgress,
      playerX: this.gameState.playerX,
      roadOffsetRate: roadState.offsetRate,
      totalLength: this.road.totalLength,
      distanceTravelled: this.gameState.distanceTravelled,
      debug: this.debugMode,
    };

    renderFrame(ctx, this.renderCtx, segmentsAhead, renderState, this.sky);
    ctx.restore();

    // ---- Fixed screen-space UI (never shakes) ----
    ctx.save();
    ctx.scale(dpr, dpr);
    this.drawHud(width, height, offRoad);
    if (this.gameState.paused) {
      this.drawPauseOverlay(width, height);
    }
    ctx.restore();
  }

  private drawHud(width: number, height: number, offRoad: boolean): void {
    if (this.debugMode) {
      this.drawDebugInfo(width, offRoad);
    } else {
      // Clean gameplay view: only an off-road warning and a restrained
      // speed readout in the corner.
      if (offRoad) {
        this.drawOffRoadWarning();
      }
      this.drawSpeedOnly(width, height);
    }
  }

  private drawSpeedOnly(width: number, height: number): void {
    const { ctx } = this.renderCtx;
    const speedPercent = Math.round((this.gameState.speed / gameConfig.maxSpeed) * 100);

    ctx.save();
    ctx.font = "15px monospace";
    ctx.fillStyle = colorRgba(parseHex(palette.lane), 0.8);
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${speedPercent}%`, width - 18, height - 18);
    ctx.restore();
  }

  private drawOffRoadWarning(): void {
    const { ctx } = this.renderCtx;

    ctx.save();
    ctx.font = "bold 15px monospace";
    ctx.fillStyle = palette.tailLight;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("OFF ROAD", 12, 12);
    ctx.restore();
  }

  private drawDebugInfo(width: number, offRoad: boolean): void {
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

    ctx.save();
    ctx.font = "14px monospace";
    ctx.fillStyle = palette.neonCyan;
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
      ctx.fillStyle = palette.tailLight;
      ctx.fillText("OFF ROAD", 12, 12 + lines.length * 20 + 8);
    }

    ctx.restore();
  }

  private drawPauseOverlay(width: number, height: number): void {
    const { ctx } = this.renderCtx;

    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.5)"; // standard dimming scrim
    ctx.fillRect(0, 0, width, height);

    ctx.font = "48px monospace";
    ctx.fillStyle = palette.lane;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("PAUSED", width / 2, height / 2);
    ctx.restore();
  }
}

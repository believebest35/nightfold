import { gameConfig } from "../config/game-config.ts";
import { palette } from "../config/palette.ts";
import { colorRgba, parseHex } from "./fog.ts";
import { SeededRandom } from "../world/seeded-random.ts";

interface RainDrop {
  x: number;
  y: number;
  length: number;
  speed: number;
  slant: number;
  width: number;
}

interface SpeedLine {
  x: number;
  y: number;
  length: number;
}

export interface WeatherRenderState {
  elapsedSeconds: number;
  speed: number;
  weatherIntensity: number;
  braking: boolean;
  offRoad: boolean;
}

export interface CameraShakeOffset {
  x: number;
  y: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function mod(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

/** Weather is adjustable at runtime but always remains within a safe range. */
export function clampWeatherIntensity(value: number): number {
  return clamp(value, 0, 1);
}

/** Rain opacity is continuous: zero weather means completely transparent. */
export function rainAlpha(weatherIntensity: number): number {
  return clampWeatherIntensity(weatherIntensity) * 0.34;
}

/** Rain motion follows car speed gently; the baseline motion prevents frozen rain. */
export function rainSpeedMultiplier(speed: number, maxSpeed = gameConfig.maxSpeed): number {
  const speedRatio = clamp(speed / maxSpeed, 0, 1);
  return 0.82 + speedRatio * 0.28;
}

/** High-speed feedback starts late and eases in so low speed stays readable. */
export function highSpeedFactor(speed: number, maxSpeed = gameConfig.maxSpeed): number {
  const speedRatio = clamp(speed / maxSpeed, 0, 1);
  return smoothstep((speedRatio - 0.58) / 0.32);
}

/** Small deterministic shake, capped at 1.5 logical pixels at maximum speed. */
export function cameraShakeOffset(
  elapsedSeconds: number,
  speed: number,
  maxSpeed = gameConfig.maxSpeed,
): CameraShakeOffset {
  const factor = highSpeedFactor(speed, maxSpeed);
  const amplitude = factor * 1.5;
  if (amplitude === 0) return { x: 0, y: 0 };
  return {
    x: amplitude * (Math.sin(elapsedSeconds * 31) * 0.65 + Math.sin(elapsedSeconds * 47) * 0.35),
    y: amplitude * (Math.cos(elapsedSeconds * 37) * 0.55 + Math.sin(elapsedSeconds * 53) * 0.45),
  };
}

/**
 * Fixed-count screen-space weather and speed feedback. Geometry is seeded once
 * and only its vertical phase changes, keeping the effect deterministic and
 * cheap even on long sessions.
 */
export class WeatherRenderer {
  private readonly rainDrops: RainDrop[];
  private readonly speedLines: SpeedLine[];

  constructor(seed: number) {
    const rng = new SeededRandom(seed);
    this.rainDrops = Array.from({ length: gameConfig.rainDropCount }, () => ({
      x: rng.range(-0.05, 1.05),
      y: rng.range(0, 1),
      length: rng.range(0.012, 0.035),
      speed: rng.range(0.72, 1.15),
      slant: rng.range(0.008, 0.018),
      width: rng.range(0.7, 1.35),
    }));
    this.speedLines = Array.from({ length: gameConfig.speedLineCount }, () => ({
      x: rng.range(0.04, 0.96),
      y: rng.range(0.54, 0.92),
      length: rng.range(0.025, 0.075),
    }));
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: WeatherRenderState,
  ): void {
    const intensity = clampWeatherIntensity(state.weatherIntensity);
    const speedRatio = clamp(state.speed / gameConfig.maxSpeed, 0, 1);
    const rainMotion = rainSpeedMultiplier(state.speed);

    if (intensity > 0) {
      this.renderRain(ctx, width, height, state.elapsedSeconds, intensity, rainMotion, speedRatio);
    }

    const speedFactor = highSpeedFactor(state.speed);
    if (speedFactor > 0) {
      this.renderSpeedLines(ctx, width, height, speedFactor);
    }

    this.renderFeedback(ctx, width, height, state, speedFactor);
  }

  private renderRain(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    elapsedSeconds: number,
    intensity: number,
    rainMotion: number,
    speedRatio: number,
  ): void {
    const rainColor = parseHex(palette.lane);
    ctx.save();
    ctx.lineCap = "round";
    ctx.strokeStyle = colorRgba(rainColor, rainAlpha(intensity));

    for (const drop of this.rainDrops) {
      const x = mod(drop.x + elapsedSeconds * 0.006, 1.1) * width - width * 0.05;
      const y = mod(drop.y + elapsedSeconds * drop.speed * rainMotion * 0.72, 1.08) * height - height * 0.04;
      const length = drop.length * height * (0.85 + speedRatio * 0.22);
      ctx.lineWidth = drop.width;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + drop.slant * width, y + length);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderSpeedLines(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    speedFactor: number,
  ): void {
    const lineColor = parseHex(palette.neonCyan);
    ctx.save();
    ctx.strokeStyle = colorRgba(lineColor, 0.04 + speedFactor * 0.12);
    ctx.lineCap = "round";

    for (const line of this.speedLines) {
      const x = line.x * width;
      const y = line.y * height;
      const length = line.length * height * (0.7 + speedFactor * 0.8);
      const direction = x < width / 2 ? -1 : 1;
      ctx.lineWidth = 0.75 + speedFactor * 0.7;
      ctx.beginPath();
      ctx.moveTo(x - direction * length * 0.18, y - length);
      ctx.lineTo(x + direction * length * 0.05, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  private renderFeedback(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    state: WeatherRenderState,
    speedFactor: number,
  ): void {
    const pulse = 0.72 + Math.sin(state.elapsedSeconds * 8) * 0.28;
    ctx.save();

    if (speedFactor > 0) {
      ctx.fillStyle = colorRgba(parseHex(palette.neonCyan), 0.018 * speedFactor);
      ctx.fillRect(0, 0, width, 5);
      ctx.fillRect(0, height - 5, width, 5);
    }

    if (state.braking) {
      ctx.fillStyle = colorRgba(parseHex(palette.tailLight), 0.07 * pulse);
      ctx.fillRect(0, height * 0.84, width * 0.16, height * 0.16);
      ctx.fillRect(width * 0.84, height * 0.84, width * 0.16, height * 0.16);
    }

    if (state.offRoad) {
      ctx.fillStyle = colorRgba(parseHex(palette.neonMagenta), 0.08);
      ctx.fillRect(0, 0, 6, height);
      ctx.fillRect(width - 6, 0, 6, height);
    }

    ctx.restore();
  }
}

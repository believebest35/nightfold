import { describe, expect, it } from "vitest";
import { gameConfig } from "../config/game-config.ts";
import {
  cameraShakeOffset,
  clampWeatherIntensity,
  highSpeedFactor,
  rainAlpha,
  rainSpeedMultiplier,
  WeatherRenderer,
} from "../render/weather-renderer.ts";

interface WeatherCanvas {
  ctx: CanvasRenderingContext2D;
  strokes: number;
  rects: number;
}

function makeCanvas(): WeatherCanvas {
  let strokes = 0;
  let rects = 0;
  let currentPath: Array<[number, number]> = [];
  const context = {
    strokeStyle: "",
    lineWidth: 1,
    fillStyle: "",
    save: () => undefined,
    restore: () => undefined,
    beginPath: () => { currentPath = []; },
    moveTo: (x: number, y: number) => { currentPath.push([x, y]); },
    lineTo: (x: number, y: number) => { currentPath.push([x, y]); },
    stroke: () => { strokes++; },
    fillRect: () => { rects++; },
  } as unknown as CanvasRenderingContext2D;
  return {
    ctx: context,
    get strokes() { return strokes; },
    get rects() { return rects; },
  };
}

describe("weather renderer", () => {
  it("keeps a fixed rain count and adds speed lines only at high speed", () => {
    const renderer = new WeatherRenderer(gameConfig.worldSeed);
    const lowSpeed = makeCanvas();
    renderer.render(lowSpeed.ctx, 320, 180, {
      elapsedSeconds: 1,
      speed: 0,
      weatherIntensity: 1,
      braking: false,
      offRoad: false,
    });
    expect(lowSpeed.strokes).toBe(gameConfig.rainDropCount);

    const highSpeed = makeCanvas();
    renderer.render(highSpeed.ctx, 320, 180, {
      elapsedSeconds: 1,
      speed: gameConfig.maxSpeed,
      weatherIntensity: 1,
      braking: false,
      offRoad: false,
    });
    expect(highSpeed.strokes).toBe(gameConfig.rainDropCount + gameConfig.speedLineCount);
  });

  it("keeps low-speed rain calmer while high speed adds impact", () => {
    expect(rainSpeedMultiplier(0)).toBeLessThan(rainSpeedMultiplier(gameConfig.maxSpeed));
    expect(highSpeedFactor(0)).toBe(0);
    expect(highSpeedFactor(gameConfig.maxSpeed)).toBe(1);
    expect(cameraShakeOffset(1, 0)).toEqual({ x: 0, y: 0 });
    const shake = cameraShakeOffset(1, gameConfig.maxSpeed);
    expect(Math.abs(shake.x)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(shake.y)).toBeLessThanOrEqual(1.5);
  });

  it("supports zero weather and distinct braking/off-road feedback", () => {
    expect(clampWeatherIntensity(-1)).toBe(0);
    expect(clampWeatherIntensity(2)).toBe(1);

    const dry = makeCanvas();
    const renderer = new WeatherRenderer(gameConfig.worldSeed);
    renderer.render(dry.ctx, 320, 180, {
      elapsedSeconds: 1,
      speed: 0,
      weatherIntensity: 0,
      braking: false,
      offRoad: false,
    });
    expect(dry.strokes).toBe(0);
    expect(dry.rects).toBe(0);

    const feedback = makeCanvas();
    renderer.render(feedback.ctx, 320, 180, {
      elapsedSeconds: 1,
      speed: 0,
      weatherIntensity: 0,
      braking: true,
      offRoad: true,
    });
    expect(feedback.rects).toBe(4);
  });

  it("fades rain opacity continuously from zero", () => {
    expect(rainAlpha(0)).toBe(0);
    expect(rainAlpha(0.1)).toBeGreaterThan(0);
    expect(rainAlpha(0.1)).toBeLessThan(rainAlpha(0.65));
    expect(rainAlpha(0.65)).toBeLessThan(rainAlpha(1));
    expect(rainAlpha(2)).toBe(0.34);
  });
});

import { describe, expect, it } from "vitest";
import { gameConfig } from "../config/game-config.ts";
import { parseWeatherIntensity } from "../core/game-options.ts";

function parse(search: string): number {
  return parseWeatherIntensity(new URLSearchParams(search));
}

describe("parseWeatherIntensity", () => {
  it("keeps the configured default when weather is missing or blank", () => {
    expect(parse("")).toBe(gameConfig.weatherIntensity);
    expect(parse("weather=")).toBe(gameConfig.weatherIntensity);
  });

  it("accepts explicit values and clamps them to the safe range", () => {
    expect(parse("weather=0")).toBe(0);
    expect(parse("weather=0.65")).toBe(0.65);
    expect(parse("weather=2")).toBe(1);
    expect(parse("weather=-1")).toBe(0);
  });

  it("keeps the default for invalid values", () => {
    expect(parse("weather=abc")).toBe(gameConfig.weatherIntensity);
  });
});

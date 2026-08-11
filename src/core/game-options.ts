import { gameConfig } from "../config/game-config.ts";
import { clampWeatherIntensity } from "../render/weather-renderer.ts";

export interface QueryParameters {
  get(name: string): string | null;
}

/** Read weather without treating a missing or blank query value as zero. */
export function parseWeatherIntensity(
  query: QueryParameters,
  fallback: number = gameConfig.weatherIntensity,
): number {
  const weatherParam = query.get("weather");
  if (weatherParam === null || weatherParam.trim() === "") {
    return fallback;
  }

  const weather = Number(weatherParam);
  return Number.isFinite(weather)
    ? clampWeatherIntensity(weather)
    : fallback;
}

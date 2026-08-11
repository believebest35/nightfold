import { gameConfig } from "../config/game-config.ts";

export type Quality = "low" | "medium" | "high";

export interface GameSettings {
  quality: Quality;
  weatherIntensity: number;
}

export interface QualityProfile {
  drawDistance: number;
  rainDropCount: number;
  speedLineCount: number;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const SETTINGS_KEY = "nightfold-settings-v1";

const QUALITY_PROFILES: Record<Quality, QualityProfile> = {
  low: { drawDistance: 160, rainDropCount: 48, speedLineCount: 8 },
  medium: { drawDistance: 240, rainDropCount: 72, speedLineCount: 10 },
  high: { drawDistance: 280, rainDropCount: 96, speedLineCount: 14 },
};

export function createDefaultSettings(): GameSettings {
  return {
    quality: "medium",
    weatherIntensity: gameConfig.weatherIntensity,
  };
}

export function getQualityProfile(quality: Quality): QualityProfile {
  return QUALITY_PROFILES[quality];
}

export function isQuality(value: unknown): value is Quality {
  return value === "low" || value === "medium" || value === "high";
}

export function clampSettingWeather(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

export function loadSettings(storage: StorageLike | null = getBrowserStorage()): GameSettings {
  const defaults = createDefaultSettings();
  if (!storage) return defaults;

  try {
    const raw = storage.getItem(SETTINGS_KEY);
    if (!raw) return defaults;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return defaults;
    const candidate = parsed as { quality?: unknown; weatherIntensity?: unknown };
    return {
      quality: isQuality(candidate.quality) ? candidate.quality : defaults.quality,
      weatherIntensity: typeof candidate.weatherIntensity === "number" && Number.isFinite(candidate.weatherIntensity)
        ? clampSettingWeather(candidate.weatherIntensity)
        : defaults.weatherIntensity,
    };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: GameSettings, storage: StorageLike | null = getBrowserStorage()): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify({
      quality: settings.quality,
      weatherIntensity: clampSettingWeather(settings.weatherIntensity),
    }));
  } catch {
    // Private browsing and storage quotas must not prevent the game from starting.
  }
}

function getBrowserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

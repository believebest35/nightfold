import { describe, expect, it } from "vitest";
import {
  createDefaultSettings,
  getQualityProfile,
  loadSettings,
  saveSettings,
} from "../core/settings.ts";

function memoryStorage() {
  let value: string | null = null;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
  };
}

describe("local game settings", () => {
  it("provides a medium-quality 65% weather default", () => {
    expect(createDefaultSettings()).toEqual({ quality: "medium", weatherIntensity: 0.65 });
  });

  it("round-trips quality and weather through storage", () => {
    const storage = memoryStorage();
    saveSettings({ quality: "high", weatherIntensity: 0.8 }, storage);
    expect(loadSettings(storage)).toEqual({ quality: "high", weatherIntensity: 0.8 });
  });

  it("recovers safely from invalid or out-of-range stored values", () => {
    const storage = memoryStorage();
    storage.setItem("nightfold-settings-v1", JSON.stringify({ quality: "ultra", weatherIntensity: 3 }));
    expect(loadSettings(storage)).toEqual({ quality: "medium", weatherIntensity: 1 });
    storage.setItem("nightfold-settings-v1", "not json");
    expect(loadSettings(storage)).toEqual(createDefaultSettings());
  });

  it("uses progressively larger render budgets for quality levels", () => {
    expect(getQualityProfile("low").drawDistance).toBeLessThan(getQualityProfile("medium").drawDistance);
    expect(getQualityProfile("medium").drawDistance).toBeLessThan(getQualityProfile("high").drawDistance);
    expect(getQualityProfile("low").rainDropCount).toBeLessThan(getQualityProfile("high").rainDropCount);
  });
});

import { gameConfig } from "../config/game-config.ts";
import { palette } from "../config/palette.ts";

export type Rgb = readonly [number, number, number];

/** Parse a #rrggbb hex color once; results are cached. */
const hexCache = new Map<string, Rgb>();

export function parseHex(hex: string): Rgb {
  const cached = hexCache.get(hex);
  if (cached) return cached;

  const value = parseInt(hex.slice(1), 16);
  const rgb: Rgb = [
    (value >> 16) & 0xff,
    (value >> 8) & 0xff,
    value & 0xff,
  ];
  hexCache.set(hex, rgb);
  return rgb;
}

export const fogRgb = parseHex(palette.fog);

/**
 * Distance fog factor in [0, 1]: 0 = no fog, 1 = fully fogged.
 * Linear over world Z, scaled by fogDensity. At the default density
 * the far end of the draw distance is fully fogged and ~10k units
 * ahead is lightly veiled.
 */
export function fogFactor(relativeZ: number): number {
  const t = (relativeZ * gameConfig.fogDensity) / 100000;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

function channel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

/** Mix a color toward the fog color by factor t, as a css color string. */
export function mixWithFog(rgb: Rgb, t: number): string {
  const [fr, fg, fb] = fogRgb;
  const [r, g, b] = rgb;
  return `rgb(${channel(r, fr, t)},${channel(g, fg, t)},${channel(b, fb, t)})`;
}

/** Fog color as rgba() with the given alpha. */
export function fogRgba(alpha: number): string {
  return colorRgba(fogRgb, alpha);
}

/** Any color as rgba() with the given alpha. */
export function colorRgba(rgb: Rgb, alpha: number): string {
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`;
}

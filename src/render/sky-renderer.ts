import { SeededRandom } from "../world/seeded-random.ts";
import { palette } from "../config/palette.ts";
import { fogRgba } from "./fog.ts";

interface SkylineBlock {
  /** Horizontal position as fraction of the strip width. */
  x: number;
  /** Width as fraction of the strip width. */
  width: number;
  /** Height as fraction of the sky half. */
  height: number;
}

/**
 * Renders the night sky: gradient, two layered mountain silhouettes,
 * a distant city skyline, and a ground-haze band at the horizon.
 *
 * Mountain/skyline geometry is generated once from a seed and cached.
 * The gradient is rebuilt on window resize (plan §13: cache gradients
 * per window size). The skyline scrolls slowly with the camera for
 * parallax without ever popping at the loop boundary (periodic wrap).
 */
export class SkyRenderer {
  private readonly mountainsFar: number[] = [];
  private readonly mountainsNear: number[] = [];
  private readonly skyline: SkylineBlock[] = [];
  private readonly skylineWidth: number;
  private gradientKey = "";
  private skyGradient: CanvasGradient | null = null;

  constructor(seed: number) {
    const rng = new SeededRandom(seed);

    // Two mountain layers: fewer, longer peaks far; more, closer peaks near.
    this.mountainsFar = this.makeRidge(rng, 14, 0.16);
    this.mountainsNear = this.makeRidge(rng, 24, 0.12);
    this.skylineWidth = rng.range(900, 1400);
    this.skyline = this.makeSkyline(rng, 36);
  }

  render(ctx: CanvasRenderingContext2D, width: number, height: number, cameraZ: number): void {
    this.ensureGradient(ctx, width, height);

    const horizonY = height / 2;
    ctx.save();

    // 1. Sky gradient
    if (this.skyGradient) {
      ctx.fillStyle = this.skyGradient;
      ctx.fillRect(0, 0, width, horizonY + 1);
    }

    // 2. Far mountains (parallax 0.02, slow)
    const farOffset = -(cameraZ * 0.02) % this.skylineWidth;
    this.drawRidge(ctx, this.mountainsFar, farOffset, horizonY, width, height, palette.mountainFar);

    // 3. Near mountains (parallax 0.04)
    const nearOffset = -(cameraZ * 0.04) % this.skylineWidth;
    this.drawRidge(ctx, this.mountainsNear, nearOffset, horizonY, width, height, palette.mountainNear);

    // 4. City skyline (parallax 0.08, the closest background layer)
    const skyOffset = -(cameraZ * 0.08) % this.skylineWidth;
    this.drawSkyline(ctx, skyOffset, horizonY, width, height);

    // 5. Ground haze at the horizon, softening the seam
    const haze = ctx.createLinearGradient(0, horizonY - height * 0.04, 0, horizonY + height * 0.3);
    haze.addColorStop(0, palette.fog);
    haze.addColorStop(1, fogRgba(0));
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizonY - height * 0.04, width, height * 0.34);

    ctx.restore();
  }

  private ensureGradient(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const key = `${width}x${height}`;
    if (key === this.gradientKey && this.skyGradient) return;

    const gradient = ctx.createLinearGradient(0, 0, 0, height / 2);
    gradient.addColorStop(0, palette.skyTop);
    gradient.addColorStop(0.55, palette.skyBottom);
    gradient.addColorStop(1, palette.fog);
    this.skyGradient = gradient;
    this.gradientKey = key;
  }

  /** Build a ridge line of mountain peaks (normalized heights). */
  private makeRidge(rng: SeededRandom, peaks: number, peakHeight: number): number[] {
    const ridge: number[] = [];
    for (let i = 0; i < peaks; i++) {
      ridge.push(rng.range(peakHeight * 0.3, peakHeight));
    }
    return ridge;
  }

  private makeSkyline(rng: SeededRandom, count: number): SkylineBlock[] {
    const blocks: SkylineBlock[] = [];
    let x = 0;
    for (let i = 0; i < count; i++) {
      const width = rng.range(0.008, 0.03);
      blocks.push({
        x,
        width,
        height: rng.range(0.08, 0.5),
      });
      x += width + rng.range(0.002, 0.012);
    }
    return blocks;
  }

  private drawRidge(
    ctx: CanvasRenderingContext2D,
    ridge: number[],
    offset: number,
    horizonY: number,
    width: number,
    height: number,
    color: string,
  ): void {
    const span = this.skylineWidth;
    const baseY = horizonY + height * 0.02;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, height);

    const peaks = ridge.length;
    for (let i = 0; i <= peaks; i++) {
      const x = ((offset + (span * i) / peaks) % span + span) % span;
      const v = ridge[i % peaks] ?? 0;
      const y = baseY - v * height;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }

  private drawSkyline(
    ctx: CanvasRenderingContext2D,
    offset: number,
    horizonY: number,
    width: number,
    height: number,
  ): void {
    const baseY = horizonY + height * 0.01;
    ctx.fillStyle = palette.skyline;
    for (const block of this.skyline) {
      const x0 = ((offset + block.x * this.skylineWidth) % this.skylineWidth + this.skylineWidth) % this.skylineWidth;
      const w = block.width * this.skylineWidth;
      // Skip blocks fully off-screen; draw the rest, allowing slight wrap.
      const x1 = x0 + w;
      const visible = x1 > 0 && x0 < width;
      if (!visible) continue;
      const topY = baseY - block.height * height;
      ctx.fillRect(x0, topY, w, baseY - topY);
      if (x1 > width) {
        ctx.fillRect(x0 - this.skylineWidth, topY, w, baseY - topY);
      }
    }
  }
}

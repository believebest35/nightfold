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

/** Positive modulo, keeps parallax offsets small and continuous. */
function mod(value: number, m: number): number {
  return ((value % m) + m) % m;
}

/**
 * Renders the night sky: gradient, two layered mountain silhouettes,
 * a distant city skyline, and a ground-haze band at the horizon.
 *
 * Parallax is driven by the monotonically increasing distance travelled,
 * NOT by the looping camera Z — positionZ wraps to zero every lap and
 * would jump the background sideways at the loop boundary.
 *
 * Mountain/skyline geometry is generated once from a seed and cached.
 * The gradient is rebuilt on window resize (plan §13). Ridge and skyline
 * patterns tile across the whole viewport, even when the viewport is
 * wider than one pattern period, without gaps or self-intersecting paths.
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

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    distanceTravelled: number,
  ): void {
    this.ensureGradient(ctx, width, height);

    const horizonY = height / 2;
    const span = this.skylineWidth;
    ctx.save();

    // 1. Sky gradient
    if (this.skyGradient) {
      ctx.fillStyle = this.skyGradient;
      ctx.fillRect(0, 0, width, horizonY + 1);
    }

    // Parallax offsets from continuous distance; mod keeps values small
    // and the wrap is invisible because the pattern period is `span`.
    // 2. Far mountains (parallax 0.02, slow)
    const farOffset = mod(-distanceTravelled * 0.02, span);
    this.drawRidge(ctx, this.mountainsFar, farOffset, horizonY, width, height, palette.mountainFar);

    // 3. Near mountains (parallax 0.04)
    const nearOffset = mod(-distanceTravelled * 0.04, span);
    this.drawRidge(ctx, this.mountainsNear, nearOffset, horizonY, width, height, palette.mountainNear);

    // 4. City skyline (parallax 0.08, the closest background layer)
    const skyOffset = mod(-distanceTravelled * 0.08, span);
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

  /**
   * Draw one ridge as a continuous left-to-right polyline tiled across
   * the whole viewport. Period boundaries share the same peak value
   * (ridge[0]), so consecutive periods join without a step.
   */
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
    const peaks = ridge.length;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, height);

    for (let k = -1; ; k++) {
      const periodStart = offset + k * span;
      if (periodStart > width) break;
      for (let i = 0; i <= peaks; i++) {
        const x = periodStart + (span * i) / peaks;
        if (x > width) break;
        const v = ridge[i % peaks] ?? 0;
        ctx.lineTo(x, baseY - v * height);
      }
    }

    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }

  /** Draw the skyline blocks, tiled until the whole viewport is covered. */
  private drawSkyline(
    ctx: CanvasRenderingContext2D,
    offset: number,
    horizonY: number,
    width: number,
    height: number,
  ): void {
    const span = this.skylineWidth;
    const baseY = horizonY + height * 0.01;
    const periods = Math.ceil(width / span) + 1;

    ctx.fillStyle = palette.skyline;
    for (let k = -1; k <= periods; k++) {
      for (const block of this.skyline) {
        const x0 = offset + block.x * span + k * span;
        const w = block.width * span;
        if (x0 + w < 0 || x0 > width) continue;
        const topY = baseY - block.height * height;
        ctx.fillRect(x0, topY, w, baseY - topY);
      }
    }
  }
}

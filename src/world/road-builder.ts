import type { RoadSegment, RoadPoint, SceneryObject, RoadZone } from "../model/types.ts";
import { gameConfig } from "../config/game-config.ts";

/**
 * Smoothstep easing: 0 at t=0, 1 at t=1, zero derivative at both ends.
 * Important property: smoothstep(t) = 1 - smoothstep(1-t), so for a
 * uniformly sampled ramp the average is exactly 0.5. This makes the
 * total curvature of an eased curve mathematically balanced:
 * Σcurve = curve * (enter/2 + hold + leave/2) exactly.
 */
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

export interface BuiltRoad {
  segments: RoadSegment[];
  totalLength: number;
}

/**
 * Builds a looping road segment by segment.
 *
 * Curvature and height always transition with ease-in/ease-out —
 * never instant. The builder tracks current Z and height; each
 * appended segment has a fixed segmentLength.
 */
export class RoadBuilder {
  private segments: RoadSegment[] = [];
  private currentZ = 0;
  private currentY = 0;
  private currentZone: RoadZone = "city";

  /**
   * Switch the zone (plan §12) for all subsequently appended segments.
   * Zones switch instantly at the segment boundary; visual continuity
   * across the seam is the scenery generator's job (fade fields, shared
   * cadences), not the builder's.
   */
  addZone(zone: RoadZone): this {
    this.currentZone = zone;
    return this;
  }

  /** `length` straight flat segments. */
  addStraight(length: number): this {
    for (let i = 0; i < length; i++) {
      this.appendSegment(0, this.currentY);
    }
    return this;
  }

  /**
   * A smooth curve with eased entry and exit:
   * `enter` segments ramping 0 → curve, `hold` at curve,
   * `leave` ramping curve → 0. Height is unchanged.
   */
  addCurve(enter: number, hold: number, leave: number, curve: number): this {
    for (let i = 0; i < enter; i++) {
      this.appendSegment(smoothstep((i + 1) / enter) * curve, this.currentY);
    }
    for (let i = 0; i < hold; i++) {
      this.appendSegment(curve, this.currentY);
    }
    for (let i = 0; i < leave; i++) {
      this.appendSegment((1 - smoothstep((i + 1) / leave)) * curve, this.currentY);
    }
    return this;
  }

  /**
   * A smooth hill (or dip for negative height): rises from the current
   * height to `height`, holds, then returns to the starting height.
   * Net height change is always zero, keeping the loop closed.
   */
  addHill(enter: number, hold: number, leave: number, height: number): this {
    const startY = this.currentY;
    for (let i = 0; i < enter; i++) {
      const t = smoothstep((i + 1) / enter);
      this.appendSegment(0, startY + (height - startY) * t);
    }
    for (let i = 0; i < hold; i++) {
      this.appendSegment(0, height);
    }
    for (let i = 0; i < leave; i++) {
      const t = smoothstep((i + 1) / leave);
      this.appendSegment(0, height + (startY - height) * t);
    }
    return this;
  }

  /** A short S-curve: one gentle right bend, one gentle left bend, net zero curvature. */
  addSCurves(): this {
    this.addCurve(8, 16, 8, 0.25);
    this.addCurve(8, 16, 8, -0.25);
    return this;
  }

  build(): BuiltRoad {
    return {
      segments: this.segments,
      totalLength: this.currentZ,
    };
  }

  private appendSegment(curve: number, yEnd: number): void {
    const index = this.segments.length;
    const p1: RoadPoint = {
      world: { worldX: 0, worldY: this.currentY, worldZ: this.currentZ },
    };
    const p2: RoadPoint = {
      world: {
        worldX: 0,
        worldY: yEnd,
        worldZ: this.currentZ + gameConfig.segmentLength,
      },
    };
    this.segments.push({
      index,
      p1,
      p2,
      curve,
      zone: this.currentZone,
      colorVariant: (index % 2) as 0 | 1,
      scenery: [] as SceneryObject[],
    });
    this.currentZ += gameConfig.segmentLength;
    this.currentY = yEnd;
  }
}

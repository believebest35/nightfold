import { describe, it, expect } from "vitest";
import { generateStraightRoad } from "../world/road-generator.ts";
import { getSegmentsAhead, findSegmentAtZ, getRoadYAtZ } from "../world/road-query.ts";

describe("generateStraightRoad", () => {
  it("creates the requested number of segments", () => {
    const road = generateStraightRoad(100);
    expect(road.segments.length).toBe(100);
  });

  it("segments have consecutive indices", () => {
    const road = generateStraightRoad(10);
    for (let i = 0; i < road.segments.length; i++) {
      expect(road.segments[i]?.index).toBe(i);
    }
  });

  it("segments have monotonically increasing Z", () => {
    const road = generateStraightRoad(50);
    for (let i = 1; i < road.segments.length; i++) {
      const prev = road.segments[i - 1];
      const curr = road.segments[i];
      if (!prev || !curr) throw new Error("unexpected missing segment");
      expect(curr.p1.world.worldZ).toBeGreaterThan(prev.p1.world.worldZ);
    }
  });

  it("total length matches segmentCount * segmentLength", () => {
    const road = generateStraightRoad(50);
    expect(road.totalLength).toBe(50 * 200); // segmentLength = 200 from config
  });

  it("all segments have curve=0, zone=city, flat Y", () => {
    const road = generateStraightRoad(10);
    for (const seg of road.segments) {
      expect(seg.curve).toBe(0);
      expect(seg.zone).toBe("city");
      expect(seg.p1.world.worldY).toBe(0);
      expect(seg.p2.world.worldY).toBe(0);
    }
  });

  it("alternates colorVariant between 0 and 1", () => {
    const road = generateStraightRoad(10);
    for (let i = 0; i < road.segments.length; i++) {
      expect(road.segments[i]?.colorVariant).toBe(i % 2);
    }
  });
});

describe("getSegmentsAhead", () => {
  const road = generateStraightRoad(100);

  it("returns the requested number of segments", () => {
    const ahead = getSegmentsAhead(road.segments, road.totalLength, 0, 50);
    expect(ahead.length).toBe(50);
  });

  it("returns empty for zero count", () => {
    const ahead = getSegmentsAhead(road.segments, road.totalLength, 0, 0);
    expect(ahead.length).toBe(0);
  });

  it("starts from the segment after the one containing positionZ", () => {
    // At Z=1000, containing segment is 5, so we start at segment 6
    const ahead = getSegmentsAhead(road.segments, road.totalLength, 1000, 1);
    expect(ahead[0]?.index).toBe(6);
  });

  it("wraps around at loop boundary", () => {
    // Near the end of the loop, camera is in last segment
    const nearEnd = road.totalLength - 100;
    const ahead = getSegmentsAhead(road.segments, road.totalLength, nearEnd, 10);
    expect(ahead.length).toBe(10);
    // Camera is in segment 99 (last), start from segment 0 (wrapped)
    expect(ahead[0]?.index).toBe(0);
    expect(ahead[1]?.index).toBe(1);
  });

  it("handles positionZ beyond totalLength", () => {
    const ahead = getSegmentsAhead(road.segments, road.totalLength, road.totalLength + 500, 5);
    expect(ahead.length).toBe(5);
    // wrappedZ = 500, containing segment = 2, start from segment 3
    expect(ahead[0]?.index).toBe(3);
  });

  it("handles negative positionZ", () => {
    const ahead = getSegmentsAhead(road.segments, road.totalLength, -500, 3);
    expect(ahead.length).toBe(3);
    // wrappedZ = 20000 - 500 = 19500, containing segment = 97, start from 98
    expect(ahead[0]?.index).toBe(98);
  });
});

describe("findSegmentAtZ", () => {
  const road = generateStraightRoad(100);

  it("finds the correct segment", () => {
    const seg = findSegmentAtZ(road.segments, road.totalLength, 1500);
    expect(seg?.index).toBe(7); // 7 * 200 = 1400 ≤ 1500 < 1600
  });

  it("returns undefined for empty segments", () => {
    const seg = findSegmentAtZ([], 0, 0);
    expect(seg).toBeUndefined();
  });

  it("wraps at loop boundary", () => {
    const seg = findSegmentAtZ(road.segments, road.totalLength, road.totalLength + 300);
    expect(seg?.index).toBe(1); // 1 * 200 = 200 ≤ 300 < 400
  });
});

describe("getRoadYAtZ", () => {
  const road = generateStraightRoad(100);

  it("returns 0 for flat road", () => {
    expect(getRoadYAtZ(road.segments, road.totalLength, 5000)).toBe(0);
  });

  it("returns 0 for empty segments", () => {
    expect(getRoadYAtZ([], 0, 0)).toBe(0);
  });
});

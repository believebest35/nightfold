import { palette } from "../config/palette.ts";

/** Screen-space lateral offset per unit of playerX, in pixels. */
const PLAYER_X_PIXELS_PER_UNIT = 40;
/** Vertical position of the car's base above the bottom edge. */
const CAR_BASE_FROM_BOTTOM = 150;

/**
 * Simplified rear view of the player's car, anchored at the bottom of
 * the screen. Shifts laterally with the player's road position to give
 * the steering a tangible visual anchor without a full car model.
 */
export function renderVehicle(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  playerX: number,
): void {
  const cx = width / 2 + playerX * PLAYER_X_PIXELS_PER_UNIT;
  const baseY = height - CAR_BASE_FROM_BOTTOM;
  const carWidth = 150;
  const carHeight = 84;

  ctx.save();

  // Body
  ctx.fillStyle = palette.vehicleBody;
  ctx.beginPath();
  ctx.roundRect(cx - carWidth / 2, baseY - carHeight, carWidth, carHeight, 14);
  ctx.fill();

  // Rear window (dark reflective hint)
  ctx.fillStyle = palette.skyTop;
  ctx.beginPath();
  ctx.roundRect(cx - carWidth * 0.32, baseY - carHeight + 10, carWidth * 0.64, 26, 8);
  ctx.fill();

  // Bumper strip
  ctx.fillStyle = palette.guardrail;
  ctx.fillRect(cx - carWidth / 2 + 8, baseY - 22, carWidth - 16, 6);

  // Tail lights
  ctx.fillStyle = palette.tailLight;
  ctx.beginPath();
  ctx.roundRect(cx - carWidth / 2 + 10, baseY - 16, 34, 9, 4);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(cx + carWidth / 2 - 44, baseY - 16, 34, 9, 4);
  ctx.fill();

  // License plate reflection
  ctx.fillStyle = palette.headLight;
  ctx.fillRect(cx - 13, baseY - 10, 26, 7);

  ctx.restore();
}

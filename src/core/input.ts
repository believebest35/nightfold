import type { InputState } from "../model/types.ts";

const keyState: Record<string, boolean> = {};

function normalizeKey(key: string): string {
  return key.toLowerCase();
}

export function setupInput(): void {
  window.addEventListener("keydown", (e) => {
    keyState[normalizeKey(e.key)] = true;
    // Prevent default for game keys to avoid scrolling etc.
    const gameKeys = [
      "arrowup",
      "arrowdown",
      "arrowleft",
      "arrowright",
      "w",
      "a",
      "s",
      "d",
      "p",
      "escape",
      "r",
      "f",
    ];
    if (gameKeys.includes(normalizeKey(e.key))) {
      e.preventDefault();
    }
  });

  window.addEventListener("keyup", (e) => {
    keyState[normalizeKey(e.key)] = false;
  });

  // Clear all keys when window loses focus to prevent stuck keys
  window.addEventListener("blur", () => {
    for (const key of Object.keys(keyState)) {
      keyState[key] = false;
    }
  });
}

export function readInput(): InputState {
  return {
    accelerate: keyState["arrowup"] === true || keyState["w"] === true,
    brake: keyState["arrowdown"] === true || keyState["s"] === true,
    steerLeft: keyState["arrowleft"] === true || keyState["a"] === true,
    steerRight: keyState["arrowright"] === true || keyState["d"] === true,
  };
}

export function isKeyPressed(key: string): boolean {
  return keyState[normalizeKey(key)] === true;
}

/** Check and consume a key press (only returns true once per press). */
export function consumeKeyPress(key: string): boolean {
  const pressed = keyState[normalizeKey(key)] === true;
  if (pressed) {
    keyState[normalizeKey(key)] = false;
  }
  return pressed;
}

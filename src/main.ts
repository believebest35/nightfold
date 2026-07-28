import { Game } from "./core/game.ts";

function main(): void {
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
  if (!canvas) {
    document.body.textContent = "Error: Canvas element not found.";
    return;
  }

  try {
    const game = new Game(canvas);
    game.start();
  } catch (err) {
    document.body.textContent = `Error: Failed to start Nightfold. ${String(err)}`;
    console.error(err);
  }
}

main();

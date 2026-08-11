import { Game } from "./core/game.ts";
import { loadSettings, saveSettings } from "./core/settings.ts";
import { createAppUI, type AppUI } from "./ui/app-ui.ts";

function main(): void {
  const app = document.getElementById("app");
  const canvas = document.getElementById("game-canvas") as HTMLCanvasElement | null;
  if (!app || !canvas) {
    showBootError(app, "The Nightfold interface could not be loaded.");
    return;
  }

  let ui: AppUI | null = null;
  try {
    const settings = loadSettings();
    const game = new Game(canvas, {
      settings,
      onSettingsChange: (nextSettings) => {
        saveSettings(nextSettings);
        ui?.handleSettingsChange(nextSettings);
      },
      onPauseChange: (paused) => ui?.handlePauseChange(paused),
    });
    ui = createAppUI(app, game);
  } catch (err) {
    showBootError(app, `Try a current version of Chrome, Safari, or Edge. ${String(err)}`);
    console.error(err);
  }
}

function showBootError(app: HTMLElement | null, message: string): void {
  if (!app) {
    document.body.textContent = message;
    return;
  }
  const fatal = app.querySelector<HTMLElement>("#fatal-error");
  const fatalMessage = app.querySelector<HTMLElement>("#fatal-error-message");
  if (fatal && fatalMessage) {
    fatalMessage.textContent = message;
    fatal.hidden = false;
  } else {
    app.textContent = message;
  }
}

main();

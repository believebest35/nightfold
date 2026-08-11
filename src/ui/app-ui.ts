import type { Game } from "../core/game.ts";
import type { GameSettings } from "../core/settings.ts";

export class AppUI {
  private readonly root: HTMLElement;
  private readonly game: Game;
  private readonly titleScreen: HTMLElement;
  private readonly toolbar: HTMLElement;
  private readonly pausePanel: HTMLElement;
  private readonly settingsPanel: HTMLElement;
  private readonly controlsPanel: HTMLElement;
  private readonly weatherInput: HTMLInputElement;
  private readonly weatherValue: HTMLOutputElement;
  private readonly fullscreenButton: HTMLButtonElement;

  constructor(root: HTMLElement, game: Game) {
    this.root = root;
    this.game = game;
    this.titleScreen = this.requireElement("#title-screen");
    this.toolbar = this.requireElement("#game-toolbar");
    this.pausePanel = this.requireElement("#pause-panel");
    this.settingsPanel = this.requireElement("#settings-panel");
    this.controlsPanel = this.requireElement("#controls-panel");
    this.weatherInput = this.requireElement("#weather-intensity") as HTMLInputElement;
    this.weatherValue = this.requireElement("#weather-value") as HTMLOutputElement;
    this.fullscreenButton = this.requireElement('[data-action="fullscreen"]') as HTMLButtonElement;

    this.bindEvents();
    this.syncSettings(game.getSettings());
  }

  handleSettingsChange(settings: GameSettings): void {
    this.syncSettings(settings);
  }

  handlePauseChange(paused: boolean): void {
    this.pausePanel.hidden = !paused;
    const pauseButton = this.root.querySelector<HTMLButtonElement>('[data-action="pause"]');
    if (pauseButton) pauseButton.textContent = paused ? "Resume" : "Pause";
  }

  showFatalError(message: string): void {
    const fatal = this.requireElement("#fatal-error");
    const messageElement = this.requireElement("#fatal-error-message");
    messageElement.textContent = message;
    fatal.hidden = false;
    this.titleScreen.hidden = true;
    this.toolbar.hidden = true;
  }

  private bindEvents(): void {
    this.root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const actionElement = target.closest<HTMLElement>("[data-action]");
      const action = actionElement?.dataset.action;
      if (action) this.handleAction(action);

      const quality = target.closest<HTMLElement>("[data-quality]")?.dataset.quality;
      if (quality === "low" || quality === "medium" || quality === "high") {
        this.game.setQuality(quality);
      }
    });

    this.weatherInput.addEventListener("input", () => {
      this.game.setWeatherIntensity(Number(this.weatherInput.value));
    });

    window.addEventListener("keydown", (event) => {
      if (event.key.toLowerCase() !== "f" || event.repeat) return;
      if (event.target instanceof HTMLInputElement) return;
      event.preventDefault();
      if (!this.toolbar.hidden) void this.toggleFullscreen();
    });

    document.addEventListener("fullscreenchange", () => {
      this.fullscreenButton.textContent = document.fullscreenElement ? "Windowed" : "Fullscreen";
    });
  }

  private handleAction(action: string): void {
    switch (action) {
      case "start":
        this.game.reset();
        this.game.start();
        this.titleScreen.hidden = true;
        this.toolbar.hidden = false;
        break;
      case "pause":
        this.game.togglePaused();
        break;
      case "resume":
        this.game.setPaused(false);
        break;
      case "restart":
        this.game.reset();
        this.game.start();
        this.titleScreen.hidden = true;
        this.pausePanel.hidden = true;
        this.toolbar.hidden = false;
        break;
      case "title":
        this.game.stop();
        this.game.reset();
        this.titleScreen.hidden = false;
        this.pausePanel.hidden = true;
        this.toolbar.hidden = true;
        break;
      case "settings":
        this.settingsPanel.hidden = false;
        break;
      case "close-settings":
        this.settingsPanel.hidden = true;
        break;
      case "controls":
        this.controlsPanel.hidden = false;
        break;
      case "close-controls":
        this.controlsPanel.hidden = true;
        break;
      case "fullscreen":
        void this.toggleFullscreen();
        break;
      default:
        break;
    }
  }

  private syncSettings(settings: GameSettings): void {
    this.weatherInput.value = String(settings.weatherIntensity);
    this.weatherValue.value = `${Math.round(settings.weatherIntensity * 100)}%`;
    this.weatherValue.textContent = this.weatherValue.value;
    for (const button of this.root.querySelectorAll<HTMLButtonElement>("[data-quality]")) {
      button.classList.toggle("is-active", button.dataset.quality === settings.quality);
      button.setAttribute("aria-checked", String(button.dataset.quality === settings.quality));
    }
  }

  private async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await this.root.requestFullscreen();
      }
    } catch {
      // Fullscreen can be denied by browser policy; the game remains usable.
    }
  }

  private requireElement(selector: string): HTMLElement {
    const element = this.root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`Nightfold UI element missing: ${selector}`);
    return element;
  }
}

export function createAppUI(root: HTMLElement, game: Game): AppUI {
  return new AppUI(root, game);
}

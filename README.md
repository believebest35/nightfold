# Nightfold / 夜叠

An endless drive through a folded neon city.

Nightfold is a pseudo-3D night driving experience running in a modern browser
using HTML5 Canvas 2D. Drive along procedurally generated mountain city roads
through curves, slopes, elevated highways, tunnels, and rainy neon nights.

## Quick Start

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (usually `http://localhost:5173`).

## Controls

| Key | Action |
|---|---|
| `ArrowUp` / `W` | Accelerate |
| `ArrowDown` / `S` | Brake |
| `ArrowLeft` / `A` | Steer left |
| `ArrowRight` / `D` | Steer right |
| `P` / `Escape` | Pause |
| `R` | Reset to road center |
| `F` | Toggle fullscreen |
| `[` / `]` | Decrease / increase weather intensity |

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Type-check and build for production |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run test` | Run Vitest tests |

## Tech Stack

- Vite + TypeScript (strict mode)
- HTML5 Canvas 2D
- Vitest for testing
- ESLint + Prettier

No runtime dependencies.

## Browser Support

- Chrome
- Edge
- Safari

Primary target device: MacBook M1 Pro.

## Project Status

Currently in **Phase 5** — rain-night atmosphere and speed feel.
See `nightfold_impl_docu.md` for the full implementation plan.

Phase 5 includes a fixed-count screen-space rain layer, speed-linked rain
motion, restrained wet-road highlights, high-speed lines and camera shake,
braking/off-road feedback, and adjustable weather intensity. The default
intensity is 65%; use `[` and `]` during play, or start with `?weather=0..1`.

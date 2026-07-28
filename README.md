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

Currently in **Phase 0** — engineering skeleton.
See `nightfold_impl_docu.md` for the full implementation plan.

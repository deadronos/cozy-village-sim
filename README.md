# Meadowbrook — Cozy Village Sim

A cozy 3D village citybuilder built with **Three.js (WebGPU + WebGL2 fallback)**, **TypeScript 7 (`tsgo`)**, **Vite 8**, **`oxlint`**, **`oxfmt`**, and a headless **Blender** modular 3D asset pack generator.

## Features
- **WebGPU / WebGL2 Rendering**: Uses Three.js `WebGPURenderer` with seamless WebGL2 fallback, soft shadows, and Morning / Golden Hour / Dusk lighting presets.
- **Blender Modular 3D Asset Pack**: `blender/generate_assets.py` procedurally generates 17 reusable modular kit pieces (`public/assets/kit/*.glb` — foundations, half-timber walls, brick walls, roofs, chimneys, fences, grass/wheat patches, trees, rocks) and 12 composed village buildings & villagers (`public/assets/models/*.glb`).
- **Hybrid Building & Terrain Painting**: Snap-to-grid buildings with translucent 3D placement previews, rotation (`R`), construction scaffolds, and upgrades, paired with click-and-drag painting for Cobble Paths, Farmfields, Wildflower Meadows, and Trees.
- **5 Autonomous Villager Jobs**:
  - **Builder** — constructs placed scaffolds into finished buildings
  - **Lumberjack** — harvests timber (stumps regrow into saplings)
  - **Farmer** — tends and harvests painted Farmfields (doubled near a Windmill)
  - **Fisherman** — fishes off shoreline Fishing Docks
  - **Smith** — gathers ore and forges Tools to boost village work speed

## Getting Started

```bash
pnpm install
pnpm run dev
```

## Scripts

```bash
pnpm run dev          # Start Vite dev server
pnpm run build        # Production build
pnpm run typecheck    # TypeScript 7 (tsgo --noEmit)
pnpm run lint         # oxlint src
pnpm run fmt          # oxfmt src
pnpm run assets:build # Regenerate all 29 .glb assets via headless Blender
```

## License

MIT © 2026 deadronos

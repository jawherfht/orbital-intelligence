# Orbital Intelligence — Satellite Tracking & Proximity Monitoring

Interactive 3D globe showing satellites in Earth orbit. Positions are **estimates** computed with the SGP4 model from public, dated orbital elements (CelesTrak OMM). The module never claims real-time measured positions and never computes a collision probability.

> Status: **Phase 1 (foundation)** — 3D Earth with real-time Sun lighting and simulated clock. Satellite data arrives in Phase 2. See [PROGRESS.md](PROGRESS.md).

## Quick start

Requirements: Node.js 20 or later.

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and production build in `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests (vitest) |

Useful URL parameter: `?t=2026-10-25T12:00:00Z` starts the simulated clock at that UTC instant. The **Debug** button shows the FPS counter and texture-alignment markers.

## Use as a module

```tsx
import { OrbitalIntelligenceModule } from './src/OrbitalIntelligenceModule';

<OrbitalIntelligenceModule height={600} />;
```

Props (`initialGroups`, `initialSelectedNoradId`, `enableProximityScreening`, `onSatelliteSelect`) are part of the public API and become active in later phases.

## Project documents

- [SPEC.md](SPEC.md) — specification (source of truth)
- [PROGRESS.md](PROGRESS.md) — phase checklist
- [DECISIONS.md](DECISIONS.md) — decision log

## Credits

| Resource | Source | Licence |
|---|---|---|
| Earth day / night / water-mask textures | Copied from the npm package [three-globe](https://github.com/vasturiano/three-globe) (example images). Appearance matches NASA Blue Marble / Black Marble, which are public domain — **provenance to be confirmed**, see DECISIONS D10. | Package: MIT |
| Inter, JetBrains Mono fonts | [@fontsource](https://fontsource.org) | SIL Open Font License 1.1 |
| SGP4 propagation | [satellite.js](https://github.com/shashwatak/satellite-js) | MIT |
| Orbital data (Phase 2) | [CelesTrak](https://celestrak.org) | Public data, see CelesTrak usage rules |

# Orbital Intelligence — Satellite Tracking & Proximity Monitoring

Interactive 3D globe showing ~1,300 catalogued objects in Earth orbit. Positions are **estimates** computed with the SGP4 model from public, dated orbital elements (CelesTrak GP data). The module never claims measured real-time positions and never computes a probability of collision.

```
CelesTrak OMM ─▶ satellite.js (SGP4) ─┬─▶ React + Three.js globe & trajectories ─┐
                                      └─▶ Proximity screening (Web Worker) ──────┴─▶ Panels, timeline ─▶ Explain (deterministic)
```

## Features

| Feature | Status | Notes |
|---|---|---|
| Earth 3D Viewer | ✅ MVP | Earth rotated by GMST, day/night lighting from the real Sun, city lights, atmosphere, starfield |
| Data loading | ✅ MVP | Offline snapshot first, "Refresh from CelesTrak" (2 h IndexedDB cache), source and date indicator, SGP4 failures skipped and counted |
| Orbit prediction | ✅ MVP | Worker propagation at 4 Hz + Hermite interpolation; full-orbit trajectory (past solid, future dashed); optional ground track ±1 period |
| Satellite search | ✅ MVP | By name (partial, case-insensitive) or exact NORAD ID, keyboard navigation |
| Satellite information | ✅ MVP | Altitude, lat/lon, speed, inclination, eccentricity, period, apogee/perigee, orbit type, **data epoch and age** |
| Time controls | ✅ MVP | Live, Pause, ×1 ×10 ×60 ×600, −6 h…+72 h slider, UTC, far-from-epoch warning |
| Proximity screening | ✅ Optional | Limited set, apogee/perigee pre-filter, 30 s scan + golden-section TCA, "Potential Close Approach — Requires Verification" |
| Event timeline | ✅ Optional | Click an event → clock jumps to the TCA, both arcs are highlighted, distance plot |
| Explanations | ✅ Optional | Deterministic texts with **Computed** / **Reference** badges; `ExplanationProvider` interface for a future assistant (no LLM) |
| Demo mode | ✅ | One click, fully offline, 5 captioned steps |
| Maneuver optimizer | ⛔ Later | Out of scope (SPEC §8.4) |

## Quick start

Requirements: Node.js 22 or later (the snapshot script uses Node's built-in TypeScript support).

```bash
npm install
npm run dev        # http://localhost:5173
```

| Command | What it does |
|---|---|
| `npm run dev` | Development server (with a `/celestrak` proxy for live refresh) |
| `npm run build` | Type-check and production build in `dist/` |
| `npm run preview` | Serve the production build |
| `npm test` | Unit tests (vitest): frames, SGP4 engine, TLE→OMM, interpolation, screening, vocabulary |
| `npm run data:update` | Download fresh snapshots into `public/data/` (skipped if less than 2 h old; add `-- --force` to override) |

Useful in the app:
* `?t=2026-10-25T12:00:00Z` starts the simulated clock at that UTC instant.
* **Debug** shows the FPS counter, the measured interpolation error and the texture-alignment markers.
* **Start demo** runs the jury scenario: overview → search ISS → fast-forward → screening → event at TCA.

## Data

* Snapshots in `public/data/` (7 groups, 1,365 objects; 1,333 after de-duplication and the SGP4 check): space stations, weather, Earth resources, science, amateur radio, geostationary, and a 400-object Starlink sample.
* `npm run data:update` downloads CelesTrak OMM JSON. If CelesTrak cannot be reached (it blocks some cloud networks), it falls back to the public GitHub mirror of CelesTrak, which re-downloads `gp.php?FORMAT=tle` every 30 min. The TLEs are converted exactly to OMM. `manifest.json` records the real source of each group, and the UI shows "via GitHub mirror of CelesTrak" when relevant. See [DECISIONS D20](DECISIONS.md).
* Data is never invented. The only synthetic objects (`SIM-A`, `SIM-B`) belong to the simulated test scenario and are always labelled "SIMULATED TEST SCENARIO — NOT REAL DATA".

## Use as a module

```tsx
import { OrbitalIntelligenceModule } from './src/OrbitalIntelligenceModule';

<OrbitalIntelligenceModule
  height={700}
  initialGroups={['stations', 'weather']}   // default: every group of the snapshot manifest
  initialSelectedNoradId={25544}            // ISS
  enableProximityScreening                  // default true
  onSatelliteSelect={(id) => console.log('selected', id)}
/>;
```

The component is self-contained: it loads its own data and fonts, and keeps its state in zustand stores under `src/store/`. Copy `public/data` and `public/textures` next to the host app's public folder.

## Limitations

* Positions are SGP4 estimates. The error is around a kilometre at the data epoch and grows with time (several km after a few days). Manoeuvres and strong drag make it worse.
* Screening reports a **minimum computed distance**, not a risk. Public GP data has no covariance, so no probability of collision can be computed. Real assessments use Conjunction Data Messages (see [ESA — Collision avoidance](https://www.esa.int/content/view/full/413425)).
* Limited sets only (≤ 500 objects against one, or ≤ 300 against each other), 30 s coarse step. See [docs/METHODOLOGY.md](docs/METHODOLOGY.md).
* Object categories are inferred from names and groups.
* Frame rate cannot be measured in the GPU-less cloud environment. Check it on a real machine with the Debug overlay (target ≥ 50 FPS).

## Project structure

```
scripts/fetch-snapshots.ts      npm run data:update
src/config.ts                   every tunable parameter
src/data/                       CelesTrak client, TLE→OMM, catalog, sampling
src/orbital/                    SGP4 wrappers, frames, derived elements, orbit paths, interpolation, propagation worker
src/screening/                  pre-filter, close-approach search, screening worker, synthetic scenario
src/scene/                      R3F scene: Earth, swarm, picking, halos, trails, camera, close-approach arcs
src/ui/                         panels: top bar, search, info, explain, time, layers, proximity, timeline, chart, modal
src/explain/                    ExplanationProvider (deterministic)
src/store/                      zustand stores: clock, catalog/selection, screening, UI, demo
```

## Project documents

* [SPEC.md](SPEC.md): specification (source of truth)
* [docs/METHODOLOGY.md](docs/METHODOLOGY.md): data, propagation, interpolation, screening algorithm and its limits
* [PROGRESS.md](PROGRESS.md): phase checklist
* [DECISIONS.md](DECISIONS.md): decision log

## Credits

| Resource | Source | Licence |
|---|---|---|
| Orbital data | [CelesTrak](https://celestrak.org) (Dr T.S. Kelso), GP data. When CelesTrak is unreachable, it is relayed by [2048lr/celestrak-mirror](https://github.com/2048lr/celestrak-mirror) | Public data, see CelesTrak usage rules |
| SGP4 propagation | [satellite.js](https://github.com/shashwatak/satellite-js) | MIT |
| 3D | [three.js](https://threejs.org), [React Three Fiber](https://r3f.docs.pmnd.rs/), [drei](https://github.com/pmndrs/drei) | MIT |
| Earth day / night / water-mask textures | Copied from the npm package [three-globe](https://github.com/vasturiano/three-globe) (example images). Appearance matches NASA Blue Marble / Black Marble, which are public domain. **Provenance to be confirmed**, see DECISIONS D10. | Package: MIT |
| Inter, JetBrains Mono fonts | [@fontsource](https://fontsource.org) | SIL Open Font License 1.1 |

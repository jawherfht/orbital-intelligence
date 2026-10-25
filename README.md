# Orbital Intelligence — Satellite Tracking & Proximity Monitoring

Interactive 3D globe showing ~1,300 catalogued objects in Earth orbit. Positions are **estimates** computed with the SGP4 model from public, dated orbital elements (CelesTrak GP data). The module never claims measured real-time positions and never computes a probability of collision.

```
CelesTrak (primary) ───┐
                       ├─▶ Validation & freshness ─▶ SGP4 (satellite.js) ─┬─▶ 3D globe, trajectories, panels
Space-Track (secondary)┘                                                   ├─▶ Proximity screening (Web Worker)
                                        N2YO (selected position checks) ───┘
```

Credentials for Space-Track and N2YO stay in a small local server (`server/`, no dependencies). The browser never sees them.

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
| Decision agent (LLM) | ✅ | On each potential close approach, **gpt-4o-mini** picks the best action among options computed by the code (sized along-track burn, or keep monitoring). **Human approval** is required; below **1 km** the action is executed automatically (simulated). Full history of approved, rejected and auto-executed decisions, exportable as JSON |
| Multi-source verification | ✅ | **Verify** tab: CelesTrak vs Space-Track (epoch, element and position differences, history; option to use the newer set) and N2YO predicted positions vs our SGP4 |
| Maneuver optimizer | ⛔ Later | Out of scope (SPEC §8.4) |

## Quick start

Requirements: Node.js 22 or later (the snapshot script uses Node's built-in TypeScript support).

```bash
npm install
npm run dev        # data server (port 8787) + app on http://localhost:5173
```

### API keys (optional, for the Verify tab)

The app works without any key: CelesTrak needs none. To enable Space-Track and N2YO:

1. Create a free account on [Space-Track.org](https://www.space-track.org/auth/createAccount) and on [N2YO](https://www.n2yo.com), then generate an API key in your N2YO profile.
2. Copy `.env.example` to `.env` (in PowerShell: `Copy-Item .env.example .env`) and fill in:
   ```
   SPACETRACK_IDENTITY=your-login
   SPACETRACK_PASSWORD=your-password
   N2YO_API_KEY=your-key
   OPENAI_API_KEY=your-openai-key   # decision agent (model gpt-4o-mini)
   ```
3. Restart `npm run dev`. The terminal prints `Space-Track: configured`, `N2YO: configured` and `LLM agent: configured (gpt-4o-mini)`.

Without `OPENAI_API_KEY`, the decision agent still works with deterministic rules, and each decision says so. When the project sits inside another repository (e.g. HackLumen), the server also reads `OPENAI_API_KEY` from the parent folder's `.env`.

`.env` is git-ignored. Never commit it. The server enforces each provider's limits: Space-Track 30 requests/min and 300/h with a 1 h cache, N2YO 1,000 transactions/h with a 30 s cache.

| Command | What it does |
|---|---|
| `npm run dev` | Local data server + Vite dev server (one command, Ctrl+C stops both) |
| `npm run dev:web` | Vite only (no Space-Track / N2YO) |
| `npm start` | Serve the production build (`npm run build` first) and the API on http://127.0.0.1:8787 |
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
server/                         local data server: CelesTrak proxy, Space-Track and N2YO clients, rate limits, caches,
                                decision agent (gpt-4o-mini) and decision history (data/decisions.json)
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
| Secondary orbital data | [Space-Track.org](https://www.space-track.org) (18th/19th Space Defense Squadron) | Free account, Space-Track user agreement |
| Decision agent | [OpenAI](https://platform.openai.com) API, model gpt-4o-mini | Paid API, your own key |
| Position verification | [N2YO](https://www.n2yo.com) REST API | Free API key, N2YO terms |
| Orbital data | [CelesTrak](https://celestrak.org) (Dr T.S. Kelso), GP data. When CelesTrak is unreachable, it is relayed by [2048lr/celestrak-mirror](https://github.com/2048lr/celestrak-mirror) | Public data, see CelesTrak usage rules |
| SGP4 propagation | [satellite.js](https://github.com/shashwatak/satellite-js) | MIT |
| 3D | [three.js](https://threejs.org), [React Three Fiber](https://r3f.docs.pmnd.rs/), [drei](https://github.com/pmndrs/drei) | MIT |
| Earth day / night / water-mask textures | Copied from the npm package [three-globe](https://github.com/vasturiano/three-globe) (example images). Appearance matches NASA Blue Marble / Black Marble, which are public domain. **Provenance to be confirmed**, see DECISIONS D10. | Package: MIT |
| Inter, JetBrains Mono fonts | [@fontsource](https://fontsource.org) | SIL Open Font License 1.1 |

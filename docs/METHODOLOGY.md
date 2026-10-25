# Methodology — Orbital Intelligence

This document explains how the module computes what it shows, and what it does **not** claim.
Values shown in the interface are **estimates** computed from public, dated orbital elements.
The module never shows a probability of collision.

## 1. Data

| Item | Detail |
|---|---|
| Source | [CelesTrak](https://celestrak.org) General Perturbations (GP) data, OMM JSON format (`gp.php?GROUP=<group>&FORMAT=JSON`). |
| Fallback | If CelesTrak is unreachable (some cloud networks are blocked), the same GP data is read from a public GitHub mirror of CelesTrak ([2048lr/celestrak-mirror](https://github.com/2048lr/celestrak-mirror)). A GitHub Actions workflow downloads `gp.php?GROUP=<group>&FORMAT=tle` every 30 minutes. The TLE text is converted **exactly** to OMM fields (`src/data/tle.ts`). A unit test checks that both paths give the same SGP4 positions to within 5 m, the residual coming from the millisecond precision of `json2satrec`'s epoch parsing. |
| Snapshot | `npm run data:update` writes `public/data/<group>.json` and `manifest.json` (download time, source URL, format, upstream refresh time). The app loads the snapshot first, so it starts immediately and works offline. |
| Live refresh | "Refresh from CelesTrak" downloads the same groups, sampled the same way, and caches them in IndexedDB. A group cached less than 2 hours ago is never downloaded again, following CelesTrak's usage guidance. |
| Sampling | Large groups (Starlink) are reduced deterministically: every k-th object by NORAD ID, so successive snapshots keep comparable subsets. |
| Category | GP data carries no object type. The category is **inferred** from catalogue naming (`DEB` → debris, `R/B` → rocket body) and from the group (named stations in `stations`). The interface labels it "Category (inferred)". |
| Invalid sets | Every element set is test-propagated when loaded. Objects for which SGP4 fails (decayed, invalid elements) are skipped and counted ("N objects skipped"). |

### Secondary source and verification (DECISIONS D28)

* **Validation & freshness**: every element set, from any source, is checked before SGP4.
  * Numeric fields; 0 ≤ e < 1; 0 ≤ i ≤ 180°; 0.05 < n < 17.5 rev/day; `EPHEMERIS_TYPE` 0.
  * Valid epoch, at most 1 day in the future.
  * Freshness: fresh < 3 days, aging ≤ 7 days, otherwise stale.
* **Space-Track** (secondary): latest GP element set and `gp_history` for the selected object, through the local server.
  * The comparison shows the epoch difference, Δi, ΔRAAN and Δn.
  * It also shows the **distance between the SGP4 positions of the two element sets** at the simulated time. A few km is typical when the epochs differ by hours; a larger value points to a manoeuvre or a stale set.
  * When the Space-Track set is newer, the user can switch the object to it.
* **N2YO** (verification): N2YO returns predicted latitude, longitude and altitude, one per second. They are compared with our SGP4 positions at the **same timestamps**: mean and maximum horizontal difference, and mean altitude difference.
  * N2YO propagates its own element sets, so this is an independent cross-check of the pipeline, not ground truth.
* **No substitute data**: a source that is unavailable is reported as such.

## 2. Propagation

* **Model**: SGP4/SDP4 through [satellite.js](https://github.com/shashwatak/satellite-js) 7.1.0 (`json2satrec`, `propagate`, `gstime`, `eciToGeodetic`). The API was checked against the installed `.d.ts` files (DECISIONS D14).
* **Output frame**: TEME, treated as ECI for display. TEME and J2000 differ by less than about 1 arcminute, which is invisible at globe scale.
* **Scene frame** (`src/orbital/frames.ts`): satellites are placed in ECI. The Earth mesh rotates by GMST. Axis mapping is `scene = (x, z, −y) / 6378.137 km`. Three families of tests check this, and two debug markers verify the texture alignment (0°/0° and Tunis).
* **Derived values** (`src/orbital/derived.ts`): period = 1440 / n; semi-major axis from Kepler's third law (μ = 398 600.4418 km³/s²); apogee and perigee = a(1 ± e) − R⊕; orbit class LEO (< 2 000 km mean altitude), GEO (35 786 ± 500 km), HEO (e > 0.25), otherwise MEO. These are mean-element values.
* **Displayed state** (altitude, latitude/longitude, speed): direct SGP4 evaluation at the simulated time, refreshed at 4 Hz.

### Rendering pipeline

1. A Web Worker propagates every object at 4 Hz of wall-clock time. Each sample is ahead of the simulated clock by one step, where step = speed × 250 ms (minimum 250 ms).
2. Each frame interpolates every position between the two samples that bracket the simulated time. It uses **cubic Hermite interpolation** with the SGP4 velocities as tangents.
   * Linear interpolation at ×600 (samples 150 s apart) would cut the orbit's chord with ~24 km of error for the ISS.
   * Hermite stays under 0.1 km (unit test `interpolate.test.ts`). The debug overlay also shows the error, measured live.
3. After a time jump (slider, Live), one synchronous propagation on the main thread fills the gap.

## 3. Trajectory and accuracy wording

* **3D trajectory**: one full orbit centred on the current time. The past half-period is drawn as a solid line fading out. The next half-period is dashed. In the inertial frame an orbit closes on itself, so ±1 period would draw the same ellipse twice.
* **Ground track** (optional): ±1 period on the rotating Earth.
* **Accuracy wording** (deterministic texts): < 1 day → "about a kilometre to a few kilometres"; < 3 days → "a few kilometres"; < 7 days → "several to tens of kilometres"; beyond → "strongly degraded". These are order-of-magnitude guides for SGP4 with public elements, not guarantees. Objects with strong drag, or objects that manoeuvre, can be much worse.
* **Far-from-epoch warning**: shown when the simulated time is more than 7 days from the data epoch. The epoch used is the selected object's, or the catalogue median when nothing is selected.

## 4. Proximity screening

Implemented in `src/screening/closeApproach.ts` and run in a Web Worker. Cancelling the run terminates the worker.

1. **Limited set**: either the selected object against at most 500 others, keeping the closest altitude bands first, or one group against itself (at most 300 objects).
2. **Pre-filter**: a pair is dropped when the perigee–apogee bands do not overlap with a 10 km margin.
3. **Co-located objects**: pairs with identical element sets are excluded and counted. This happens, for example, with ISS modules that CelesTrak publishes with the station's elements. Their "distance" would be 0 km by construction, which is meaningless.
4. **Coarse scan**: each object is propagated on a 30 s grid over the window (default 24 h, maximum 72 h). The ECI Euclidean distance is computed for each pair at each step, and local minima are kept.
5. **Gating**: a local minimum is refined only when its coarse distance is below threshold + 15.5 km/s × step / 2 (≈ 242 km at 30 s).
   * 15.5 km/s bounds the relative speed of two Earth orbiters (head-on in LEO).
   * The sample nearest to the true closest approach is at most step/2 away in time, so its distance is at most d_min + v_rel × step/2. A real approach below the threshold can therefore not be discarded by the gate.
6. **Refinement**: golden-section search with full SGP4 on [t(k−1), t(k+1)], to 1 ms. It gives the **TCA** and the **minimum computed distance**.
7. **Output**: pair, TCA (UTC), minimum computed distance, relative speed at TCA, and the data age of both objects at TCA. An event is kept if the distance is below the threshold (default 10 km, adjustable from 1 to 50 km).
8. **Labels**: "Potential Close Approach — Requires Verification". Amber is used up to the threshold, and red below 1 km, always with the same wording.

### Why a 30 s step

At 15 km/s, two objects move 450 km relative to each other in 30 s. The step is therefore not used to *measure* the minimum. It only *finds* the time interval that contains it, and the gate above makes sure the right interval is refined.

Remaining limit: two separate minima in the same 60 s interval would be merged. This happens only in unusual co-orbital geometries. A smaller step (`SCREENING.coarseStepS` in `src/config.ts`) reduces this at a linear cost in compute time.

### Validation

`src/screening/__tests__/screening.test.ts` builds two synthetic orbits (550 km, inclinations 53° and 97.5°, same RAAN).

* Their mean anomalies are calibrated on the actual SGP4 ascending-node crossings, so both objects reach the node at a known instant.
* The screening must find the event with TCA within ±2 s of that instant, and agree with a 50 ms brute-force scan (< 0.1 s, < 50 m).
* A variant offset by 4 s along-track (miss distance ≈ 20–30 km) must not be reported at 10 km, and must be reported at 50 km.

## 4b. Decision agent (DECISIONS D29)

1. **Options computed by the code** for one event:
   * **monitor**;
   * for a manoeuvrable primary (payload or station), **along-track burns** sized for target miss distances of 2 and 5 km.
     * Sizing uses the first-order Clohessy–Wiltshire secular drift, Δx ≈ 3·Δv·t.
     * The burn happens 2 h before the TCA (no earlier than 10 min from now), with a lead of at least 30 min and Δv ≤ 2 m/s.
     * It is an order-of-magnitude sizing, not a manoeuvre plan.
2. **Choice by gpt-4o-mini.**
   * The model receives only these computed facts: distance, TCA, relative speed, data ages and options.
   * It must return one `option_id` from a strict JSON-schema enum, with an urgency, a rationale and caveats.
   * Any other id is rejected. If the LLM is unavailable, a deterministic rule decides and is labelled as such.
3. **Policy.**
   * Below 1 km of minimum computed distance, the chosen action is **executed automatically**, which is simulated and recorded as `auto-policy`.
   * Otherwise it waits for a human **approval or rejection**.
   * Every decision is kept in the history.

The agent inherits the limits of §5: without covariance, a minimum computed distance is not a risk value. The agent is told to say when the distance is within the expected position error.

## 5. What the screening is not

* **It is not a probability of collision.** A probability needs position covariance, which public GP data does not contain.
* **It is not a conjunction assessment.** Operators and agencies (see [ESA — Collision avoidance](https://www.esa.int/content/view/full/413425)) work from Conjunction Data Messages with covariance, owner/operator ephemerides and manoeuvre plans.
* The SGP4 errors of both objects are of the same order as typical thresholds (kilometres). A flagged event is a geometry **worth checking**, nothing more.

## 6. Simulated test scenario

When a real screening finds nothing, which is common because real close approaches under 10 km are rare in a small set, the user (or the demo) can run the synthetic scenario from §4.

* Its objects (`SIM-A`, `SIM-B`, NORAD 990001/990002) carry a permanent "SIMULATED TEST SCENARIO — NOT REAL DATA" banner, in the event cards, the panel and the Explain texts.
* They are never mixed silently with real data, and "Clear simulated scenario" removes them.

## 7. Explanations

`src/explain/ExplanationProvider.ts` defines an `ExplanationProvider` interface. The MVP ships a deterministic provider: sentences are templated from computed values. Each paragraph is tagged **Computed** (derived from this module's calculations) or **Reference** (generic documentation).

A future conversational assistant (for example a simple RAG over these texts) can implement the same interface and must keep that distinction. No language model is called by this prototype.

/**
 * Close-approach screening (SPEC §8.2, docs/METHODOLOGY.md).
 *
 *   1. limited set (selected object vs ≤ N objects, or one group vs itself);
 *   2. apogee/perigee pre-filter with a margin;
 *   3. coarse scan: every object propagated on a fixed grid (default 30 s)
 *      over the window, ECI Euclidean distance per pair, local minima kept
 *      when the coarse distance is below threshold + gate (gate = max LEO
 *      relative speed × step / 2, so a minimum between two samples cannot be
 *      lost by the gating);
 *   4. refinement: golden-section search on [t(k−1), t(k+1)] with full SGP4,
 *      giving TCA (to ~1 ms) and the minimum computed distance;
 *   5. events under the threshold are reported with relative speed and data age.
 *
 * It never computes a probability (SPEC §2.2).
 * Pure functions: run in the screening worker and in unit tests.
 */
import type { SatRec } from 'satellite.js';
import { propagateEci } from '../orbital/propagate';
import { altitudeBand, bandDistance, bandsOverlap, type AltitudeBand } from './prefilter';

/** Upper bound of relative speed in Earth orbit used for gating, km/s (head-on LEO). */
export const MAX_REL_SPEED_KMS = 15.5;

export interface ScreeningObject {
  id: number;
  name: string;
  satrec: SatRec;
  epochMs: number;
  meanMotionRevPerDay: number;
  eccentricity: number;
  /** Raw elements, used to detect co-located (docked) objects. */
  elementsKey: string;
  simulated?: boolean;
}

export interface ScreeningParams {
  startMs: number;
  windowHours: number;
  stepS: number;
  thresholdKm: number;
  marginKm: number;
}

export interface CloseApproachEvent {
  id: string;
  primaryId: number;
  secondaryId: number;
  primaryName: string;
  secondaryName: string;
  tcaMs: number;
  minDistanceKm: number;
  relSpeedKmS: number;
  primaryAgeDays: number;
  secondaryAgeDays: number;
  simulated: boolean;
}

export interface ScreeningStats {
  objects: number;
  pairsTotal: number;
  pairsAfterPrefilter: number;
  colocatedExcluded: number;
  durationMs: number;
}

export interface ScreeningResult {
  events: CloseApproachEvent[];
  stats: ScreeningStats;
}

export type Pair = [number, number];

/** Pairs for "primary vs others", capped to the `maxOthers` closest altitude bands. */
export function pairsPrimaryVsOthers(objects: ScreeningObject[], primaryIndex: number, marginKm: number, maxOthers: number) {
  const bands = objects.map((o) => altitudeBand(o.meanMotionRevPerDay, o.eccentricity));
  const p = bands[primaryIndex]!;
  const candidates: { j: number; d: number }[] = [];
  let colocated = 0;
  for (let j = 0; j < objects.length; j++) {
    if (j === primaryIndex) continue;
    if (!bandsOverlap(p, bands[j]!, marginKm)) continue;
    if (objects[j]!.elementsKey === objects[primaryIndex]!.elementsKey) {
      colocated += 1;
      continue;
    }
    candidates.push({ j, d: bandDistance(p, bands[j]!) });
  }
  candidates.sort((a, b) => a.d - b.d);
  const kept = candidates.slice(0, maxOthers);
  return {
    pairs: kept.map(({ j }) => [primaryIndex, j] as Pair),
    pairsTotal: objects.length - 1,
    capped: candidates.length > maxOthers,
    colocated,
  };
}

/** All pairs of a set, after the pre-filter. */
export function pairsAllVsAll(objects: ScreeningObject[], marginKm: number) {
  const bands: AltitudeBand[] = objects.map((o) => altitudeBand(o.meanMotionRevPerDay, o.eccentricity));
  const pairs: Pair[] = [];
  let colocated = 0;
  for (let i = 0; i < objects.length; i++) {
    for (let j = i + 1; j < objects.length; j++) {
      if (!bandsOverlap(bands[i]!, bands[j]!, marginKm)) continue;
      if (objects[i]!.elementsKey === objects[j]!.elementsKey) {
        colocated += 1;
        continue;
      }
      pairs.push([i, j]);
    }
  }
  return { pairs, pairsTotal: (objects.length * (objects.length - 1)) / 2, colocated };
}

function distanceAt(a: SatRec, b: SatRec, tMs: number): number {
  const d = new Date(tMs);
  const pa = propagateEci(a, d);
  const pb = propagateEci(b, d);
  if (!pa || !pb) return Infinity;
  return Math.hypot(pa.r[0] - pb.r[0], pa.r[1] - pb.r[1], pa.r[2] - pb.r[2]);
}

/** Golden-section minimisation of the pair distance on [lo, hi] (ms). */
export function refineMinimum(a: SatRec, b: SatRec, loMs: number, hiMs: number, tolMs = 1): { tMs: number; dKm: number } {
  const g = (Math.sqrt(5) - 1) / 2;
  let lo = loMs;
  let hi = hiMs;
  let x1 = hi - g * (hi - lo);
  let x2 = lo + g * (hi - lo);
  let f1 = distanceAt(a, b, x1);
  let f2 = distanceAt(a, b, x2);
  while (hi - lo > tolMs) {
    if (f1 < f2) {
      hi = x2;
      x2 = x1;
      f2 = f1;
      x1 = hi - g * (hi - lo);
      f1 = distanceAt(a, b, x1);
    } else {
      lo = x1;
      x1 = x2;
      f1 = f2;
      x2 = lo + g * (hi - lo);
      f2 = distanceAt(a, b, x2);
    }
  }
  const t = (lo + hi) / 2;
  return { tMs: t, dKm: distanceAt(a, b, t) };
}

/**
 * Runs the screening on the given pairs. `onProgress` receives 0–1;
 * `isCancelled` is polled between objects / pairs.
 */
export function screenPairs(
  objects: ScreeningObject[],
  pairs: Pair[],
  params: ScreeningParams,
  onProgress: (fraction: number) => void = () => {},
  isCancelled: () => boolean = () => false,
): CloseApproachEvent[] {
  const steps = Math.floor((params.windowHours * 3600) / params.stepS) + 1;
  const stepMs = params.stepS * 1000;

  // Ephemeris table only for objects that appear in a pair. Float32 (sub-metre at 7 000 km) is plenty for the coarse scan.
  const used = new Set<number>();
  for (const [i, j] of pairs) {
    used.add(i);
    used.add(j);
  }
  const eph = new Map<number, Float32Array>();
  let done = 0;
  const totalWork = used.size + pairs.length / 50;
  for (const i of used) {
    if (isCancelled()) return [];
    const table = new Float32Array(steps * 3).fill(Number.NaN);
    const s = objects[i]!.satrec;
    for (let k = 0; k < steps; k++) {
      const p = propagateEci(s, new Date(params.startMs + k * stepMs));
      if (p) table.set(p.r, k * 3);
    }
    eph.set(i, table);
    done += 1;
    if (done % 10 === 0) onProgress(done / totalWork);
  }

  const gate = params.thresholdKm + (MAX_REL_SPEED_KMS * params.stepS) / 2;
  const events: CloseApproachEvent[] = [];
  const dist = new Float64Array(steps);
  for (let pIdx = 0; pIdx < pairs.length; pIdx++) {
    if (pIdx % 200 === 0) {
      if (isCancelled()) return [];
      onProgress((used.size + pIdx / 50) / totalWork);
    }
    const [i, j] = pairs[pIdx]!;
    const A = eph.get(i)!;
    const B = eph.get(j)!;
    for (let k = 0; k < steps; k++) {
      const dx = A[k * 3]! - B[k * 3]!;
      const dy = A[k * 3 + 1]! - B[k * 3 + 1]!;
      const dz = A[k * 3 + 2]! - B[k * 3 + 2]!;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      dist[k] = Number.isNaN(d) ? Infinity : d;
    }
    for (let k = 1; k < steps - 1; k++) {
      const d = dist[k]!;
      if (d > gate || !(d <= dist[k - 1]! && d < dist[k + 1]!)) continue;
      const oi = objects[i]!;
      const oj = objects[j]!;
      const lo = params.startMs + (k - 1) * stepMs;
      const hi = params.startMs + (k + 1) * stepMs;
      const { tMs, dKm } = refineMinimum(oi.satrec, oj.satrec, lo, hi);
      if (!(dKm < params.thresholdKm)) continue;
      const date = new Date(tMs);
      const si = propagateEci(oi.satrec, date);
      const sj = propagateEci(oj.satrec, date);
      if (!si || !sj) continue;
      events.push({
        id: `${oi.id}-${oj.id}-${Math.round(tMs)}`,
        primaryId: oi.id,
        secondaryId: oj.id,
        primaryName: oi.name,
        secondaryName: oj.name,
        tcaMs: tMs,
        minDistanceKm: dKm,
        relSpeedKmS: Math.hypot(si.v[0] - sj.v[0], si.v[1] - sj.v[1], si.v[2] - sj.v[2]),
        primaryAgeDays: (tMs - oi.epochMs) / 86_400_000,
        secondaryAgeDays: (tMs - oj.epochMs) / 86_400_000,
        simulated: Boolean(oi.simulated || oj.simulated),
      });
    }
  }
  onProgress(1);
  return events.sort((a, b) => a.tcaMs - b.tcaMs);
}

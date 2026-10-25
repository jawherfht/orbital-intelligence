/**
 * Synthetic test scenario (DECISIONS D8, D9).
 *
 * Two near-circular orbits with the same RAAN and altitude but different
 * inclinations intersect at the ascending node. Both mean anomalies are set
 * so that the two objects reach that node at the same chosen instant: a
 * built-in close approach whose TCA is known in advance.
 *
 * SGP4 secular (J2) and short-period terms depend on inclination, so a purely
 * Keplerian design drifts by seconds. The mean anomaly of each object is
 * therefore calibrated numerically: its actual SGP4 ascending-node crossing
 * is found by bisection and shifted onto the designed instant.
 *
 * Used by the screening unit test and by the "Simulated test scenario" mode,
 * always labelled "SIMULATED TEST SCENARIO — NOT REAL DATA". Never mixed
 * silently with real data.
 */
import { json2satrec, type OMMJsonObject } from 'satellite.js';
import { EARTH_RADIUS_KM, MU_EARTH_KM3_S2 } from '../config';
import type { OmmRecord } from '../types/orbital';
import { propagateEci } from '../orbital/propagate';

export const SIMULATED_IDS = { a: 990001, b: 990002 } as const;

export interface SyntheticOptions {
  /** Instant both objects reach the ascending node, ms. */
  crossingMs: number;
  /** Element epoch = crossing − leadMinutes. Keep it short: differential J2 nodal regression moves the node lines apart (~0.6° in 3 h). */
  leadMinutes?: number;
  altitudeKm?: number;
  inclinationA?: number;
  inclinationB?: number;
  raanDeg?: number;
  /** Along-track offset of object B, seconds (creates a non-zero miss distance). */
  offsetBSeconds?: number;
}

function meanMotionRevPerDay(altitudeKm: number): number {
  const a = EARTH_RADIUS_KM + altitudeKm;
  const periodS = 2 * Math.PI * Math.sqrt((a * a * a) / MU_EARTH_KM3_S2);
  return 86400 / periodS;
}

/** Time (ms) of the ascending-node crossing (ECI z: − → +) nearest to `guessMs`, by bisection. */
export function nodeCrossingMs(omm: OmmRecord, guessMs: number, halfWindowMs = 20 * 60_000): number | null {
  // The cast only widens OmmRecord to satellite.js's OMMJsonObject.
  const satrec = json2satrec(omm as unknown as OMMJsonObject);
  const z = (t: number) => propagateEci(satrec, new Date(t))?.r[2] ?? Number.NaN;
  let best: number | null = null;
  for (let t = guessMs - halfWindowMs; t < guessMs + halfWindowMs; t += 30_000) {
    let lo = t;
    let hi = t + 30_000;
    if (!(z(lo) < 0 && z(hi) >= 0)) continue;
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (z(mid) < 0) lo = mid;
      else hi = mid;
    }
    const c = (lo + hi) / 2;
    if (best === null || Math.abs(c - guessMs) < Math.abs(best - guessMs)) best = c;
  }
  return best;
}

function isoNoZ(ms: number): string {
  return new Date(ms).toISOString().replace('Z', '').replace(/\.(\d{3})$/, '.$1000');
}

export function syntheticCrossingPair(opts: SyntheticOptions): [OmmRecord, OmmRecord] {
  const lead = opts.leadMinutes ?? 10;
  const alt = opts.altitudeKm ?? 550;
  const n = meanMotionRevPerDay(alt);
  const periodMin = 1440 / n;
  const epochMs = opts.crossingMs - lead * 60_000;
  const make = (id: number, name: string, incl: number, offsetS: number): OmmRecord => {
    // Mean anomaly so that M + ω = 0 (ascending node) at the crossing instant.
    const m = (((-((lead * 60 + offsetS) / (periodMin * 60)) * 360) % 360) + 360) % 360;
    return {
      OBJECT_NAME: name,
      OBJECT_ID: 'SIMULATED',
      EPOCH: isoNoZ(epochMs),
      MEAN_MOTION: n,
      ECCENTRICITY: 0.0001,
      INCLINATION: incl,
      RA_OF_ASC_NODE: opts.raanDeg ?? 40,
      ARG_OF_PERICENTER: 0,
      MEAN_ANOMALY: m,
      EPHEMERIS_TYPE: 0,
      CLASSIFICATION_TYPE: 'U',
      NORAD_CAT_ID: id,
      ELEMENT_SET_NO: 999,
      REV_AT_EPOCH: 0,
      BSTAR: 0,
      MEAN_MOTION_DOT: 0,
      MEAN_MOTION_DDOT: 0,
    };
  };
  const calibrate = (o: OmmRecord, targetMs: number): OmmRecord => {
    let cur = o;
    for (let iter = 0; iter < 3; iter++) {
      const t = nodeCrossingMs(cur, targetMs);
      if (t === null) break;
      const shiftDeg = ((t - targetMs) / (periodMin * 60_000)) * 360;
      cur = { ...cur, MEAN_ANOMALY: (((cur.MEAN_ANOMALY + shiftDeg) % 360) + 360) % 360 };
    }
    return cur;
  };
  const offsetMs = (opts.offsetBSeconds ?? 0) * 1000;
  return [
    calibrate(make(SIMULATED_IDS.a, 'SIM-A (TEST OBJECT)', opts.inclinationA ?? 53, 0), opts.crossingMs),
    calibrate(make(SIMULATED_IDS.b, 'SIM-B (TEST OBJECT)', opts.inclinationB ?? 97.5, 0), opts.crossingMs + offsetMs),
  ];
}

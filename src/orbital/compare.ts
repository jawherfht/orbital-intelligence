/**
 * Cross-source comparisons (DECISIONS D28). Pure functions, all "Computed":
 *   - CelesTrak element set vs Space-Track element set for the same object;
 *   - our SGP4 positions vs N2YO's predicted positions at N2YO's timestamps.
 * Differences between sources are expected (different epochs, independent
 * propagation): they indicate consistency, not who is "right".
 */
import type { SatRec } from 'satellite.js';
import { EARTH_RADIUS_KM } from '../config';
import type { OmmRecord } from '../types/orbital';
import type { N2yoPosition } from '../types/sources';
import { epochMs } from '../data/validation';
import { propagateEci, stateAt } from './propagate';

export interface ElementSetComparison {
  /** Positive when B is newer than A. */
  epochDiffHours: number;
  dInclinationDeg: number;
  dRaanDeg: number;
  dEccentricity: number;
  dMeanMotionRevDay: number;
  /** Distance between the two SGP4 positions at `atMs`, km (null if one fails). */
  positionDiffKm: number | null;
  sameElementSet: boolean;
}

function angleDiff(a: number, b: number): number {
  return ((((b - a) % 360) + 540) % 360) - 180;
}

export function compareElementSets(a: OmmRecord, satA: SatRec, b: OmmRecord, satB: SatRec, atMs: number): ElementSetComparison {
  const pa = propagateEci(satA, new Date(atMs));
  const pb = propagateEci(satB, new Date(atMs));
  return {
    epochDiffHours: (epochMs(b.EPOCH) - epochMs(a.EPOCH)) / 3_600_000,
    dInclinationDeg: b.INCLINATION - a.INCLINATION,
    dRaanDeg: angleDiff(a.RA_OF_ASC_NODE, b.RA_OF_ASC_NODE),
    dEccentricity: b.ECCENTRICITY - a.ECCENTRICITY,
    dMeanMotionRevDay: b.MEAN_MOTION - a.MEAN_MOTION,
    positionDiffKm: pa && pb ? Math.hypot(pa.r[0] - pb.r[0], pa.r[1] - pb.r[1], pa.r[2] - pb.r[2]) : null,
    sameElementSet: Math.abs(epochMs(a.EPOCH) - epochMs(b.EPOCH)) < 1000 && a.MEAN_MOTION === b.MEAN_MOTION && a.MEAN_ANOMALY === b.MEAN_ANOMALY,
  };
}

/** Great-circle distance between two lat/lon points on a sphere of radius r, km. */
export function greatCircleKm(lat1: number, lon1: number, lat2: number, lon2: number, r = EARTH_RADIUS_KM): number {
  const d = Math.PI / 180;
  const dLat = (lat2 - lat1) * d;
  const dLon = (lon2 - lon1) * d;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(dLon / 2) ** 2;
  return 2 * r * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface PositionCheck {
  samples: number;
  /** Horizontal difference at the satellite's altitude, km. */
  meanHorizontalKm: number;
  maxHorizontalKm: number;
  meanAltitudeDiffKm: number;
  /** First compared sample, for display. */
  first: { timestampMs: number; n2yo: { lat: number; lon: number; altKm: number }; sgp4: { lat: number; lon: number; altKm: number } } | null;
}

export function compareWithN2yo(satrec: SatRec, positions: N2yoPosition[]): PositionCheck {
  let n = 0;
  let sumH = 0;
  let maxH = 0;
  let sumAlt = 0;
  let first: PositionCheck['first'] = null;
  for (const p of positions) {
    const t = p.timestamp * 1000;
    const s = stateAt(satrec, new Date(t));
    if (!s) continue;
    const h = greatCircleKm(p.satlatitude, p.satlongitude, s.latDeg, s.lonDeg, EARTH_RADIUS_KM + (p.sataltitude + s.altKm) / 2);
    n += 1;
    sumH += h;
    maxH = Math.max(maxH, h);
    sumAlt += s.altKm - p.sataltitude;
    if (!first) first = { timestampMs: t, n2yo: { lat: p.satlatitude, lon: p.satlongitude, altKm: p.sataltitude }, sgp4: { lat: s.latDeg, lon: s.lonDeg, altKm: s.altKm } };
  }
  return { samples: n, meanHorizontalKm: n ? sumH / n : Number.NaN, maxHorizontalKm: maxH, meanAltitudeDiffKm: n ? sumAlt / n : Number.NaN, first };
}

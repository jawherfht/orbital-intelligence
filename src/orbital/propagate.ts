/**
 * Thin wrappers around satellite.js (API confirmed in DECISIONS D14).
 * Every SGP4 failure (null result, satrec.error ≠ 0, NaN) returns null so that
 * callers can skip the object cleanly instead of drawing garbage.
 */
import { eciToGeodetic, gstime, propagate, degreesLat, degreesLong, type SatRec } from 'satellite.js';
import type { StateVector } from '../types/orbital';

export interface EciState {
  /** km, TEME/ECI */
  r: [number, number, number];
  /** km/s */
  v: [number, number, number];
}

/** Raw ECI position/velocity, or null on any SGP4 error. */
export function propagateEci(satrec: SatRec, date: Date): EciState | null {
  let pv;
  try {
    pv = propagate(satrec, date);
  } catch {
    return null;
  }
  if (!pv || satrec.error !== 0) return null;
  const { position: p, velocity: v } = pv;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return null;
  return { r: [p.x, p.y, p.z], v: [v.x, v.y, v.z] };
}

/** Full state vector with geodetic coordinates, or null on SGP4 error. */
export function stateAt(satrec: SatRec, date: Date): StateVector | null {
  const eci = propagateEci(satrec, date);
  if (!eci) return null;
  const [x, y, z] = eci.r;
  const geo = eciToGeodetic({ x, y, z }, gstime(date));
  return {
    time: date,
    positionEciKm: eci.r,
    velocityEciKmS: eci.v,
    latDeg: degreesLat(geo.latitude),
    lonDeg: degreesLong(geo.longitude),
    altKm: geo.height,
    speedKmS: Math.hypot(...eci.v),
  };
}

/**
 * True when the element set can be propagated at the given instant.
 * Decayed or otherwise broken objects fail here and are skipped and counted (SPEC M2).
 */
export function isPropagatable(satrec: SatRec, date: Date): boolean {
  return propagateEci(satrec, date) !== null;
}

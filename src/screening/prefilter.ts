/**
 * Apogee/perigee pre-filter (SPEC §8.2 step 2, docs/METHODOLOGY.md).
 * Two objects whose altitude bands do not overlap (with a margin) can never
 * come close, so the pair is dropped before any propagation.
 */
import { deriveElements } from '../orbital/derived';

export interface AltitudeBand {
  perigeeKm: number;
  apogeeKm: number;
}

export function altitudeBand(meanMotionRevPerDay: number, eccentricity: number): AltitudeBand {
  const d = deriveElements(meanMotionRevPerDay, eccentricity);
  return { perigeeKm: d.perigeeKm, apogeeKm: d.apogeeKm };
}

export function bandsOverlap(a: AltitudeBand, b: AltitudeBand, marginKm: number): boolean {
  return a.perigeeKm - marginKm <= b.apogeeKm && b.perigeeKm - marginKm <= a.apogeeKm;
}

/** Distance between the mean altitudes of two bands, used to rank candidates when the set is capped. */
export function bandDistance(a: AltitudeBand, b: AltitudeBand): number {
  return Math.abs((a.perigeeKm + a.apogeeKm) / 2 - (b.perigeeKm + b.apogeeKm) / 2);
}

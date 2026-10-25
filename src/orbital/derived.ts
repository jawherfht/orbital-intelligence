/**
 * Quantities derived from the mean elements (SPEC §4.4).
 * These are mean-element (Keplerian) values, not osculating ones:
 * good for display and for the apogee/perigee pre-filter, not for precise work.
 */
import { EARTH_RADIUS_KM, MU_EARTH_KM3_S2, ORBIT_CLASS } from '../config';
import type { DerivedElements, OrbitClass } from '../types/orbital';

export function periodMinutes(meanMotionRevPerDay: number): number {
  return 1440 / meanMotionRevPerDay;
}

/** Kepler's third law: a = (μ T² / 4π²)^(1/3). */
export function semiMajorAxisKm(meanMotionRevPerDay: number): number {
  const periodS = periodMinutes(meanMotionRevPerDay) * 60;
  return Math.cbrt((MU_EARTH_KM3_S2 * periodS * periodS) / (4 * Math.PI * Math.PI));
}

export function classifyOrbit(perigeeKm: number, apogeeKm: number, eccentricity: number): OrbitClass {
  if (eccentricity > ORBIT_CLASS.heoMinEccentricity) return 'HEO';
  const meanAlt = (perigeeKm + apogeeKm) / 2;
  if (meanAlt < ORBIT_CLASS.leoMaxAltKm) return 'LEO';
  if (Math.abs(meanAlt - ORBIT_CLASS.geoAltKm) <= ORBIT_CLASS.geoToleranceKm) return 'GEO';
  return 'MEO';
}

export function deriveElements(meanMotionRevPerDay: number, eccentricity: number): DerivedElements {
  const a = semiMajorAxisKm(meanMotionRevPerDay);
  const apogeeKm = a * (1 + eccentricity) - EARTH_RADIUS_KM;
  const perigeeKm = a * (1 - eccentricity) - EARTH_RADIUS_KM;
  return {
    periodMin: periodMinutes(meanMotionRevPerDay),
    semiMajorAxisKm: a,
    apogeeKm,
    perigeeKm,
    orbitClass: classifyOrbit(perigeeKm, apogeeKm, eccentricity),
  };
}

/** Age of the element set at a given instant, in days (positive = data older than the instant). */
export function dataAgeDays(epoch: Date, at: Date): number {
  return (at.getTime() - epoch.getTime()) / 86_400_000;
}

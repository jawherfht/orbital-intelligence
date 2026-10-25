/**
 * Trajectory sampling for the selected object (SPEC §6.2, M6).
 */
import { eciToGeodetic, gstime, degreesLat, degreesLong, type SatRec } from 'satellite.js';
import { propagateEci } from './propagate';
import { eciToScene, latLonToEarthFixedScene, type Vec3 } from './frames';

export interface OrbitSample {
  timeMs: number;
  /** Inertial scene coordinates (Earth radii). */
  scene: Vec3;
  latDeg: number;
  lonDeg: number;
  altKm: number;
}

/**
 * Samples [center - before, center + after] with `points` samples.
 * Samples where SGP4 fails are dropped.
 */
export function sampleOrbit(satrec: SatRec, centerMs: number, beforeMs: number, afterMs: number, points: number): OrbitSample[] {
  const out: OrbitSample[] = [];
  const n = Math.max(2, points);
  const start = centerMs - beforeMs;
  const step = (beforeMs + afterMs) / (n - 1);
  for (let i = 0; i < n; i++) {
    const t = start + i * step;
    const date = new Date(t);
    const eci = propagateEci(satrec, date);
    if (!eci) continue;
    const [x, y, z] = eci.r;
    const geo = eciToGeodetic({ x, y, z }, gstime(date));
    out.push({
      timeMs: t,
      scene: eciToScene({ x, y, z }),
      latDeg: degreesLat(geo.latitude),
      lonDeg: degreesLong(geo.longitude),
      altKm: geo.height,
    });
  }
  return out;
}

/**
 * Ground track points in the Earth-fixed scene frame (the parent group must
 * be rotated by GMST, like the Earth mesh). Slightly above the surface.
 */
export function groundTrack(samples: OrbitSample[], radius = 1.004): Vec3[] {
  return samples.map((s) => latLonToEarthFixedScene(s.latDeg, s.lonDeg, radius));
}

/**
 * Splits a polyline wherever consecutive points are too far apart
 * (e.g. a dropped SGP4 sample), so no false chord is drawn.
 */
export function splitPolyline(points: Vec3[], maxGap: number): Vec3[][] {
  const parts: Vec3[][] = [];
  let current: Vec3[] = [];
  for (const p of points) {
    const prev = current[current.length - 1];
    if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1], p[2] - prev[2]) > maxGap) {
      if (current.length > 1) parts.push(current);
      current = [];
    }
    current.push(p);
  }
  if (current.length > 1) parts.push(current);
  return parts;
}

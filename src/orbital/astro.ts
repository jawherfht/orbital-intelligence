/**
 * Earth rotation and Sun direction, using satellite.js only (API confirmed in DECISIONS D14).
 */
import { gstime, jday, sunPos } from 'satellite.js';
import { eciDirectionToScene, type Vec3 } from './frames';

/** Greenwich Mean Sidereal Time, radians. */
export function gmstAt(date: Date): number {
  return gstime(date);
}

/** Unit vector from the Earth's centre toward the Sun, in scene coordinates. */
export function sunDirectionScene(date: Date): Vec3 {
  const { rsun } = sunPos(jday(date));
  return eciDirectionToScene(rsun);
}

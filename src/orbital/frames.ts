/**
 * Reference frames — the single source of truth for coordinate conversions (SPEC §6.1).
 *
 * MODEL CHOSEN (DECISIONS D15):
 *   - Satellites are placed in the ECI frame (TEME, as output by SGP4).
 *   - The Earth mesh is rotated about the scene Y axis by the GMST angle,
 *     so that ECEF-fixed features (the texture) line up with ECI positions.
 *
 * AXIS MAPPING (ECI/ECEF has Z toward the North Pole, Three.js has Y up):
 *   scene.x =  eci.x
 *   scene.y =  eci.z
 *   scene.z = -eci.y
 *
 * SCALE: 1 scene unit = 1 Earth equatorial radius (6378.137 km).
 *
 * TEXTURE: an equirectangular map on a THREE.SphereGeometry places
 * longitude 0° on +X and longitude +90°E on -Z, which matches the mapping above
 * when the Earth mesh rotation.y = GMST. Verified by tests and debug markers.
 */
import { EARTH_RADIUS_KM } from '../config';

export type Vec3 = [number, number, number];

export interface EciLike {
  x: number;
  y: number;
  z: number;
}

const DEG = Math.PI / 180;

/** ECI (or ECEF) vector in km → scene coordinates in Earth radii. */
export function eciToScene(v: EciLike): Vec3 {
  return [v.x / EARTH_RADIUS_KM, v.z / EARTH_RADIUS_KM, -v.y / EARTH_RADIUS_KM];
}

/** Direction-only conversion (no scaling), e.g. for the Sun vector. */
export function eciDirectionToScene(v: EciLike): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z) || 1;
  return [v.x / len, v.z / len, -v.y / len];
}

/**
 * Point on a sphere at the given geocentric latitude/longitude, in the
 * Earth-fixed scene frame (i.e. before the GMST rotation is applied).
 * radius is in Earth radii (1 = surface).
 */
export function latLonToEarthFixedScene(latDeg: number, lonDeg: number, radius = 1): Vec3 {
  const lat = latDeg * DEG;
  const lon = lonDeg * DEG;
  const x = Math.cos(lat) * Math.cos(lon);
  const y = Math.cos(lat) * Math.sin(lon);
  const z = Math.sin(lat);
  // Same axis mapping as eciToScene, applied to an ECEF unit vector.
  return [x * radius, z * radius, -y * radius];
}

/**
 * Applies the Earth rotation (GMST, radians) to an Earth-fixed scene point,
 * giving its position in the inertial scene frame. Equivalent to
 * Object3D.rotation.y = gmst on the Earth mesh.
 */
export function rotateByGmst(p: Vec3, gmst: number): Vec3 {
  const c = Math.cos(gmst);
  const s = Math.sin(gmst);
  const [x, y, z] = p;
  return [x * c + z * s, y, -x * s + z * c];
}

/** Earth-mesh rotation about the scene Y axis for a given GMST (radians). */
export function earthRotationY(gmst: number): number {
  return gmst;
}

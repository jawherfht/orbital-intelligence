import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ecfToEci, eciToGeodetic, degreesLat, degreesLong, gstime } from 'satellite.js';
import { EARTH_RADIUS_KM } from '../../config';
import { eciToScene, latLonToEarthFixedScene, rotateByGmst, type Vec3 } from '../frames';

const close = (a: Vec3, b: Vec3, eps = 1e-9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i] as number, -Math.log10(eps)));

describe('axis mapping (SPEC §6.1)', () => {
  it('maps ECI x→x, z→y, y→-z and scales to Earth radii', () => {
    close(eciToScene({ x: EARTH_RADIUS_KM, y: 0, z: 0 }), [1, 0, 0]);
    close(eciToScene({ x: 0, y: EARTH_RADIUS_KM, z: 0 }), [0, 0, -1]);
    close(eciToScene({ x: 0, y: 0, z: EARTH_RADIUS_KM }), [0, 1, 0]);
  });

  it('keeps a right-handed frame (x × y = z survives the mapping)', () => {
    const x = new THREE.Vector3(...eciToScene({ x: 1, y: 0, z: 0 })).normalize();
    const y = new THREE.Vector3(...eciToScene({ x: 0, y: 1, z: 0 })).normalize();
    const z = new THREE.Vector3(...eciToScene({ x: 0, y: 0, z: 1 })).normalize();
    expect(x.clone().cross(y).distanceTo(z)).toBeLessThan(1e-12);
  });
});

describe('Earth rotation by GMST matches satellite.js ecfToEci', () => {
  const date = new Date('2026-10-25T12:34:56Z');
  const gmst = gstime(date);
  const points: Array<[number, number]> = [
    [0, 0],
    [36.8, 10.2], // Tunis
    [-33.9, 151.2],
    [64.1, -21.9],
  ];

  it.each(points)('lat %f lon %f', (lat, lon) => {
    const fixed = latLonToEarthFixedScene(lat, lon, 1);
    const ecf = {
      x: fixed[0] * EARTH_RADIUS_KM,
      y: -fixed[2] * EARTH_RADIUS_KM,
      z: fixed[1] * EARTH_RADIUS_KM,
    };
    const fromSatelliteJs = eciToScene(ecfToEci(ecf, gmst));
    close(rotateByGmst(fixed, gmst), fromSatelliteJs, 1e-9);
  });

  it('round-trips back to the same longitude through eciToGeodetic', () => {
    const fixed = latLonToEarthFixedScene(0, 10.2, 1);
    const ecf = { x: fixed[0] * EARTH_RADIUS_KM, y: -fixed[2] * EARTH_RADIUS_KM, z: fixed[1] * EARTH_RADIUS_KM };
    const geo = eciToGeodetic(ecfToEci(ecf, gmst), gmst);
    expect(degreesLong(geo.longitude)).toBeCloseTo(10.2, 6);
    expect(degreesLat(geo.latitude)).toBeCloseTo(0, 6);
  });
});

describe('texture alignment on THREE.SphereGeometry', () => {
  // An equirectangular texture maps u = (lon + 180) / 360 and v = (lat + 90) / 180.
  // We check that the sphere vertex carrying those UVs sits where latLonToEarthFixedScene puts that lat/lon.
  const geo = new THREE.SphereGeometry(1, 72, 36);
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');

  it.each([
    [0, 0],
    [36.8, 10.2],
    [45, -90],
    [-30, 120],
  ])('lat %f lon %f lands on the right texel', (lat, lon) => {
    const target = new THREE.Vector3(...latLonToEarthFixedScene(lat, lon, 1));
    let best = Infinity;
    let bestUv = new THREE.Vector2();
    for (let i = 0; i < pos.count; i++) {
      const d = target.distanceTo(new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)));
      if (d < best) {
        best = d;
        bestUv = new THREE.Vector2(uv.getX(i), uv.getY(i));
      }
    }
    const expectedU = (lon + 180) / 360;
    const expectedV = (lat + 90) / 180;
    // Grid spacing is 5°, so the nearest vertex is within ~2.5° of the target.
    expect(Math.abs(bestUv.x - expectedU)).toBeLessThan(2.6 / 360);
    expect(Math.abs(bestUv.y - expectedV)).toBeLessThan(2.6 / 180);
  });
});

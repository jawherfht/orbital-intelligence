/**
 * Smooth camera flight toward the selected object (SPEC §6.4).
 * The orbit target stays at the Earth's centre; only the viewpoint moves.
 */
import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { CAMERA, INTERACTION } from '../config';
import { useOrbitalStore } from '../store/useOrbitalStore';
import { swarm } from './swarmEngine';

interface Flight {
  start: number;
  fromDir: THREE.Vector3;
  fromDist: number;
  id: number;
}

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

export function CameraRig() {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean; update: () => void } | null;
  const focusRequest = useOrbitalStore((s) => s.focusRequest);
  const flight = useRef<Flight | null>(null);

  useEffect(() => {
    const id = useOrbitalStore.getState().selectedId;
    if (focusRequest === 0 || id === null) return;
    flight.current = {
      start: performance.now(),
      fromDir: camera.position.clone().normalize(),
      fromDist: camera.position.length(),
      id,
    };
  }, [focusRequest, camera]);

  useFrame(() => {
    const f = flight.current;
    if (!f) return;
    const p = swarm.scenePosition(f.id);
    if (!p) return;
    const target = new THREE.Vector3(...p);
    const r = target.length();
    // Low orbits: come close; high orbits: back off to keep the Earth in view.
    const toDist = THREE.MathUtils.clamp(r < 1.5 ? 3.0 : r * 1.45, CAMERA.minDistance + 0.3, CAMERA.maxDistance);
    const toDir = target.clone().normalize();
    // Slightly offset toward the current view so the object is not hidden behind its own halo.
    toDir.lerp(f.fromDir, 0.15).normalize();
    const k = Math.min(1, (performance.now() - f.start) / INTERACTION.cameraFocusMs);
    const e = easeInOut(k);
    const dir = f.fromDir.clone().lerp(toDir, e);
    if (dir.lengthSq() < 1e-6) dir.copy(toDir);
    dir.normalize();
    camera.position.copy(dir.multiplyScalar(THREE.MathUtils.lerp(f.fromDist, toDist, e)));
    camera.lookAt(0, 0, 0);
    if (controls) {
      controls.enabled = k >= 1;
      controls.update();
    }
    if (k >= 1) flight.current = null;
  });

  return null;
}

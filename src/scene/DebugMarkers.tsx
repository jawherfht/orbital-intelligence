/**
 * Texture-alignment markers (SPEC §6.1). Positions are computed with the
 * same functions used for satellites, so a misaligned texture is visible.
 */
import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type * as THREE from 'three';
import { DEBUG_MARKERS } from '../config';
import { latLonToEarthFixedScene, rotateByGmst } from '../orbital/frames';
import { gmstAt } from '../orbital/astro';
import { getSimDate } from '../store/simulationClock';

function Marker({ latDeg, lonDeg, label }: { latDeg: number; lonDeg: number; label: string }) {
  const ref = useRef<THREE.Group>(null);
  const fixed = latLonToEarthFixedScene(latDeg, lonDeg, 1.002);
  useFrame(() => {
    const [x, y, z] = rotateByGmst(fixed, gmstAt(getSimDate()));
    ref.current?.position.set(x, y, z);
  });
  return (
    <group ref={ref}>
      <mesh>
        <sphereGeometry args={[0.012, 16, 16]} />
        <meshBasicMaterial color="#f59e0b" />
      </mesh>
      <Html distanceFactor={4} occlude={false} center style={{ pointerEvents: 'none' }}>
        <div className="debug-marker-label">{label}</div>
      </Html>
    </group>
  );
}

export function DebugMarkers() {
  return (
    <>
      {DEBUG_MARKERS.map((m) => (
        <Marker key={m.id} latDeg={m.latDeg} lonDeg={m.lonDeg} label={m.label} />
      ))}
    </>
  );
}

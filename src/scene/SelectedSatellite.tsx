/**
 * Pulsing halo on the selected object (cyan) and on the screening
 * counterpart (amber), following the interpolated swarm position.
 */
import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { COLORS } from '../config';
import { useOrbitalStore } from '../store/useOrbitalStore';
import { swarm } from './swarmEngine';

function makeHaloTexture(): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.18, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.3, 'rgba(255,255,255,0.15)');
    g.addColorStop(0.62, 'rgba(255,255,255,0.0)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function Halo({ id, color }: { id: number; color: string }) {
  const ref = useRef<THREE.Sprite>(null);
  const texture = useMemo(makeHaloTexture, []);
  useFrame(({ camera, clock }) => {
    const s = ref.current;
    if (!s) return;
    const p = swarm.scenePosition(id);
    s.visible = p !== null;
    if (!p) return;
    s.position.set(p[0], p[1], p[2]);
    // Constant apparent size, gentle pulse.
    const dist = camera.position.distanceTo(s.position);
    const pulse = 1 + 0.18 * Math.sin(clock.elapsedTime * 4);
    s.scale.setScalar(dist * 0.045 * pulse);
  });
  return (
    <sprite ref={ref} renderOrder={3}>
      <spriteMaterial map={texture} color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
  );
}

export function SelectedSatellite() {
  const selectedId = useOrbitalStore((s) => s.selectedId);
  const secondaryId = useOrbitalStore((s) => s.secondaryId);
  return (
    <>
      {selectedId !== null && <Halo key={`p${selectedId}`} id={selectedId} color={COLORS.selected} />}
      {secondaryId !== null && <Halo key={`s${secondaryId}`} id={secondaryId} color={COLORS.approach} />}
    </>
  );
}

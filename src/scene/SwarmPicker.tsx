/**
 * Hover and click picking in screen space (SPEC §6.4): the nearest visible
 * object within a few pixels, ignoring objects hidden behind the Earth.
 */
import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { INTERACTION } from '../config';
import { isVisible, useOrbitalStore } from '../store/useOrbitalStore';
import { swarm } from './swarmEngine';

const v = new THREE.Vector3();

/** True when the segment camera → point crosses the Earth (unit sphere) first. */
function occludedByEarth(cam: THREE.Vector3, p: THREE.Vector3): boolean {
  const d = p.clone().sub(cam);
  const len = d.length();
  d.divideScalar(len);
  const b = cam.dot(d);
  const c = cam.lengthSq() - 1;
  const disc = b * b - c;
  if (disc < 0) return false;
  const t = -b - Math.sqrt(disc);
  return t > 0 && t < len;
}

export function pickAt(camera: THREE.Camera, rect: DOMRect, clientX: number, clientY: number): number | null {
  const { records, hiddenCategories, hiddenGroups } = useOrbitalStore.getState();
  const filters = { hiddenCategories, hiddenGroups };
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  let best: number | null = null;
  let bestD2 = INTERACTION.pickRadiusPx ** 2;
  const camPos = camera.position;
  for (let i = 0; i < records.length; i++) {
    if (!swarm.valid[i]) continue;
    const r = records[i]!;
    if (!isVisible(r, filters)) continue;
    v.set(swarm.scene[i * 3]!, swarm.scene[i * 3 + 1]!, swarm.scene[i * 3 + 2]!);
    const world = v.clone();
    v.project(camera);
    if (v.z > 1 || v.z < -1) continue;
    const sx = ((v.x + 1) / 2) * rect.width;
    const sy = ((1 - v.y) / 2) * rect.height;
    const d2 = (sx - mx) ** 2 + (sy - my) ** 2;
    if (d2 < bestD2 && !occludedByEarth(camPos, world)) {
      bestD2 = d2;
      best = r.noradId;
    }
  }
  return best;
}

export function SwarmPicker() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    let down: { x: number; y: number } | null = null;
    let raf = 0;
    let last: PointerEvent | null = null;

    const hover = () => {
      raf = 0;
      if (!last) return;
      const rect = el.getBoundingClientRect();
      const id = pickAt(camera, rect, last.clientX, last.clientY);
      const store = useOrbitalStore.getState();
      if (id !== store.hoveredId || id !== null) {
        store.setHover(id, id === null ? null : { x: last.clientX - rect.left, y: last.clientY - rect.top });
      }
      el.style.cursor = id === null ? '' : 'pointer';
    };
    const onMove = (e: PointerEvent) => {
      last = e;
      if (!raf) raf = requestAnimationFrame(hover);
    };
    const onLeave = () => {
      last = null;
      useOrbitalStore.getState().setHover(null);
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
      down = null;
      if (moved > INTERACTION.clickMaxMovePx) return;
      const id = pickAt(camera, el.getBoundingClientRect(), e.clientX, e.clientY);
      if (id !== null) useOrbitalStore.getState().select(id);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointerup', onUp);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointerup', onUp);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [camera, gl]);

  return null;
}

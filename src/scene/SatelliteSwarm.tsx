/**
 * All catalogued objects as one THREE.Points draw call (DECISIONS D21):
 * soft additive sprites, colour per inferred category, hidden objects get
 * size 0. Positions come from swarmEngine (worker + Hermite interpolation).
 */
import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { CATEGORY_COLORS, RENDER } from '../config';
import { isVisible, useOrbitalStore } from '../store/useOrbitalStore';
import { simTimeMs, useClock } from '../store/simulationClock';
import { swarm } from './swarmEngine';

const vertex = /* glsl */ `
  attribute vec3 aColor;
  attribute float aSize;
  uniform float uPixelRatio;
  varying vec3 vColor;
  varying float vSize;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float s = aSize * uPixelRatio * clamp(4.0 / -mv.z, 0.55, 2.2);
    vSize = s;
    gl_PointSize = s;
  }
`;

const fragment = /* glsl */ `
  varying vec3 vColor;
  varying float vSize;
  void main() {
    if (vSize <= 0.0) discard;
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float core = smoothstep(0.55, 0.0, d);
    float glow = smoothstep(1.0, 0.2, d) * 0.45;
    float a = core + glow;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

export function SatelliteSwarm() {
  const records = useOrbitalStore((s) => s.records);
  const catalogVersion = useOrbitalStore((s) => s.catalogVersion);
  const hiddenCategories = useOrbitalStore((s) => s.hiddenCategories);
  const hiddenGroups = useOrbitalStore((s) => s.hiddenGroups);
  const pointsRef = useRef<THREE.Points>(null);

  // (Re)initialise the propagation engine when the catalog changes.
  useEffect(() => {
    swarm.init(records);
  }, [records, catalogVersion]);

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const n = records.length;
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    const colors = new Float32Array(n * 3);
    const c = new THREE.Color();
    records.forEach((r, i) => {
      c.set(CATEGORY_COLORS[r.category] ?? '#ffffff');
      colors.set([c.r, c.g, c.b], i * 3);
    });
    g.setAttribute('aColor', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(n), 1));
    // Positions move every frame: use a fixed bounding sphere large enough for GEO.
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 50);
    return g;
  }, [records]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  // Filter → per-point size (0 = hidden).
  const baseSizes = useMemo(() => {
    const filters = { hiddenCategories, hiddenGroups };
    return Float32Array.from(records, (r) => (isVisible(r, filters) ? (r.category === 'station' ? RENDER.pointSize * 1.5 : RENDER.pointSize) : 0));
  }, [records, hiddenCategories, hiddenGroups]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: vertex,
        fragmentShader: fragment,
        uniforms: { uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [],
  );

  useFrame(() => {
    const clock = useClock.getState();
    swarm.update(simTimeMs(clock), clock.speed, clock.paused);
    if (swarm.scene.length !== records.length * 3) return;
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    (pos.array as Float32Array).set(swarm.scene);
    pos.needsUpdate = true;
    const size = geometry.getAttribute('aSize') as THREE.BufferAttribute;
    const arr = size.array as Float32Array;
    for (let i = 0; i < arr.length; i++) arr[i] = swarm.valid[i] ? baseSizes[i]! : 0;
    size.needsUpdate = true;
  });

  return <points ref={pointsRef} geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}

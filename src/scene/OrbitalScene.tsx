/**
 * Root 3D scene: camera, controls, starfield, Earth, debug helpers.
 */
import { Suspense, useLayoutEffect, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars } from '@react-three/drei';
import * as THREE from 'three';
import { CAMERA } from '../config';
import { Earth } from './Earth';
import { DebugMarkers } from './DebugMarkers';
import { useUiStore } from '../store/useUiStore';
import { getSimDate } from '../store/simulationClock';
import { gmstAt } from '../orbital/astro';
import { latLonToEarthFixedScene, rotateByGmst } from '../orbital/frames';

/** Opening view: the camera looks down on North Africa / the Mediterranean (lat 30°N, lon 10°E). */
function InitialView() {
  const camera = useThree((s) => s.camera);
  const aspect = useThree((s) => s.size.width / Math.max(s.size.height, 1));
  useLayoutEffect(() => {
    // On portrait screens, back off so the whole globe fits horizontally.
    const distance = aspect < 1 ? CAMERA.initialDistance / Math.max(aspect, 0.45) * 0.72 : CAMERA.initialDistance;
    const [x, y, z] = rotateByGmst(latLonToEarthFixedScene(30, 10, distance), gmstAt(getSimDate()));
    camera.position.set(x, y, z);
    camera.lookAt(0, 0, 0);
    // Only on mount: later resizes must not move a camera the user has rotated.
  }, [camera]);
  return null;
}

/** Samples the frame rate twice per second and stores it for the debug overlay. */
function FpsProbe() {
  const setFps = useUiStore((s) => s.setFps);
  const acc = useRef({ frames: 0, time: 0 });
  useFrame((_, delta) => {
    acc.current.frames += 1;
    acc.current.time += delta;
    if (acc.current.time >= 0.5) {
      setFps(Math.round(acc.current.frames / acc.current.time));
      acc.current = { frames: 0, time: 0 };
    }
  });
  return null;
}

export function OrbitalScene() {
  const debug = useUiStore((s) => s.debug);
  return (
    <Canvas
      className="orbital-canvas"
      dpr={[1, 2]}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{
        fov: CAMERA.fovDeg,
        near: 0.01,
        far: 500,
        position: [CAMERA.initialDistance, 0, 0],
      }}
    >
      <color attach="background" args={['#05070d']} />
      <InitialView />
      <Stars radius={120} depth={60} count={6000} factor={3.2} saturation={0} fade speed={0.3} />
      <Suspense fallback={null}>
        <Earth />
      </Suspense>
      {debug && <DebugMarkers />}
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        zoomSpeed={0.7}
        minDistance={CAMERA.minDistance}
        maxDistance={CAMERA.maxDistance}
      />
      <FpsProbe />
    </Canvas>
  );
}

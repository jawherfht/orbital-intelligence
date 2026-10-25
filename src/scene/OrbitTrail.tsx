/**
 * Computed trajectory of the selected object (SPEC M6, §7), DECISIONS D23:
 *   - 3D (inertial frame): one full orbit, the past half-period as a solid
 *     line fading out and the next half-period dashed. In the inertial frame
 *     ±1 period would draw the same closed ellipse twice on top of itself.
 *   - optional ground track on the rotating Earth: ±1 period (the two passes
 *     are distinct there because the Earth turns underneath).
 * Recomputed when the simulated time moves by more than 1/90 of a period.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import * as THREE from 'three';
import { COLORS, RENDER } from '../config';
import { useOrbitalStore } from '../store/useOrbitalStore';
import { getSimDate } from '../store/simulationClock';
import { periodMinutes } from '../orbital/derived';
import { groundTrack, sampleOrbit, splitPolyline, type OrbitSample } from '../orbital/orbitPath';
import { gmstAt } from '../orbital/astro';
import { earthRotationY, type Vec3 } from '../orbital/frames';
import type { SatelliteRecord } from '../types/orbital';

function useOrbitSamples(rec: SatelliteRecord | undefined): OrbitSample[] {
  const [samples, setSamples] = useState<OrbitSample[]>([]);
  const centerRef = useRef<number | null>(null);
  const periodMs = rec ? periodMinutes(rec.meanMotionRevPerDay) * 60_000 : 0;

  useEffect(() => {
    centerRef.current = null;
    setSamples([]);
  }, [rec]);

  useFrame(() => {
    if (!rec) return;
    const t = getSimDate().getTime();
    if (centerRef.current !== null && Math.abs(t - centerRef.current) < periodMs / 90) return;
    centerRef.current = t;
    // ±1 period sampled once; the 3D trail uses the central ±½ period.
    setSamples(sampleOrbit(rec.satrec, t, periodMs, periodMs, RENDER.orbitPathPoints));
  });
  return samples;
}

/** Splits samples into past (fading solid) and future (dashed) polylines. */
function TrajectoryLines({ samples, color, emphasis = 1 }: { samples: OrbitSample[]; color: string; emphasis?: number }) {
  const { past, future } = useMemo(() => {
    const now = getSimDate().getTime();
    const p: OrbitSample[] = [];
    const f: OrbitSample[] = [];
    for (const s of samples) (s.timeMs <= now ? p : f).push(s);
    // Join both halves at the current point.
    const last = p[p.length - 1];
    if (last) f.unshift(last);
    return { past: p, future: f };
  }, [samples]);

  const c = useMemo(() => new THREE.Color(color), [color]);
  const pastParts = useMemo(() => splitPolyline(past.map((s) => s.scene), 0.5), [past]);
  const futureParts = useMemo(() => splitPolyline(future.map((s) => s.scene), 0.5), [future]);

  return (
    <>
      {pastParts.map((pts, k) => (
        <Line
          key={`p${k}`}
          points={pts}
          vertexColors={pts.map((_, i) => [c.r, c.g, c.b, (0.05 + 0.75 * (i / Math.max(1, pts.length - 1))) * emphasis] as [number, number, number, number])}
          lineWidth={1.6}
          depthWrite={false}
        />
      ))}
      {futureParts.map((pts, k) => (
        <Line key={`f${k}`} points={pts} color={color} lineWidth={1.4} dashed dashSize={0.035} gapSize={0.025} transparent opacity={0.85 * emphasis} depthWrite={false} />
      ))}
    </>
  );
}

/** Group that rotates with the Earth (GMST), for Earth-fixed geometry. */
function EarthFixed({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = earthRotationY(gmstAt(getSimDate()));
  });
  return <group ref={ref}>{children}</group>;
}

function GroundTrack({ samples, color }: { samples: OrbitSample[]; color: string }) {
  const parts = useMemo(() => {
    // Break the line at the antimeridian-like jumps on the sphere.
    const pts: Vec3[] = groundTrack(samples);
    return splitPolyline(pts, 0.3);
  }, [samples]);
  return (
    <EarthFixed>
      {parts.map((pts, k) => (
        <Line key={k} points={pts} color={color} lineWidth={1.2} transparent opacity={0.55} depthWrite={false} />
      ))}
    </EarthFixed>
  );
}

function ObjectTrail({ id, color, showGround, emphasis }: { id: number; color: string; showGround: boolean; emphasis?: number }) {
  const rec = useOrbitalStore((s) => s.byId.get(id));
  const samples = useOrbitSamples(rec);
  const halfOrbit = useMemo(() => {
    const n = samples.length;
    return samples.slice(Math.floor(n / 4), Math.ceil((3 * n) / 4));
  }, [samples]);
  if (samples.length < 2) return null;
  return (
    <>
      <TrajectoryLines samples={halfOrbit} color={color} emphasis={emphasis} />
      {showGround && <GroundTrack samples={samples} color={color} />}
    </>
  );
}

export function OrbitTrails() {
  const selectedId = useOrbitalStore((s) => s.selectedId);
  const secondaryId = useOrbitalStore((s) => s.secondaryId);
  const showOrbit = useOrbitalStore((s) => s.showOrbit);
  const showGroundTrack = useOrbitalStore((s) => s.showGroundTrack);
  if (!showOrbit) return null;
  return (
    <>
      {selectedId !== null && <ObjectTrail key={`p${selectedId}`} id={selectedId} color={COLORS.selected} showGround={showGroundTrack} />}
      {secondaryId !== null && <ObjectTrail key={`s${secondaryId}`} id={secondaryId} color={COLORS.approach} showGround={false} emphasis={0.9} />}
    </>
  );
}

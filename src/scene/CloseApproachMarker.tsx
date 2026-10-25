/**
 * Active screening event (SPEC §7, O2): both trajectory arcs ±3 min around the
 * TCA in amber (red below the tight threshold), and a marker at the TCA point.
 */
import { useMemo } from 'react';
import { Line } from '@react-three/drei';
import { COLORS, SCREENING } from '../config';
import { useOrbitalStore } from '../store/useOrbitalStore';
import { activeEvent, useScreeningStore } from '../store/useScreeningStore';
import { sampleOrbit } from '../orbital/orbitPath';
import { splitPolyline } from '../orbital/orbitPath';

const ARC_MS = 3 * 60_000;

export function CloseApproachMarker() {
  const ev = useScreeningStore((s) => activeEvent(s));
  const byId = useOrbitalStore((s) => s.byId);

  const arcs = useMemo(() => {
    if (!ev) return null;
    const a = byId.get(ev.primaryId);
    const b = byId.get(ev.secondaryId);
    if (!a || !b) return null;
    const sa = sampleOrbit(a.satrec, ev.tcaMs, ARC_MS, ARC_MS, 61).map((s) => s.scene);
    const sb = sampleOrbit(b.satrec, ev.tcaMs, ARC_MS, ARC_MS, 61).map((s) => s.scene);
    const tca = sampleOrbit(a.satrec, ev.tcaMs, 0, 0, 2)[0]?.scene;
    return { sa: splitPolyline(sa, 0.5), sb: splitPolyline(sb, 0.5), tca };
  }, [ev, byId]);

  if (!ev || !arcs) return null;
  const color = ev.minDistanceKm < SCREENING.tightThresholdKm ? COLORS.tight : COLORS.approach;
  return (
    <group renderOrder={4}>
      {[...arcs.sa, ...arcs.sb].map((pts, k) => (
        <Line key={k} points={pts} color={color} lineWidth={3} transparent opacity={0.95} depthWrite={false} />
      ))}
      {arcs.tca && (
        <mesh position={arcs.tca}>
          <sphereGeometry args={[0.008, 16, 16]} />
          <meshBasicMaterial color={color} />
        </mesh>
      )}
    </group>
  );
}

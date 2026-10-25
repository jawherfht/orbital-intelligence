/**
 * Distance vs time around the TCA of the active event (SPEC O2).
 * Lightweight inline SVG instead of a chart library (DECISIONS D22).
 * Values are recomputed with SGP4 on the main thread (121 samples, ±10 min).
 */
import { useMemo } from 'react';
import { en } from '../i18n/en';
import { COLORS, SCREENING } from '../config';
import { useOrbitalStore } from '../store/useOrbitalStore';
import type { CloseApproachEvent } from '../screening/closeApproach';
import { propagateEci } from '../orbital/propagate';

const HALF_MS = 10 * 60_000;
const N = 121;
const W = 300;
const H = 120;
const PAD = { l: 34, r: 8, t: 8, b: 22 };

export function DistanceChart({ event, thresholdKm }: { event: CloseApproachEvent; thresholdKm: number }) {
  const byId = useOrbitalStore((s) => s.byId);
  const data = useMemo(() => {
    const a = byId.get(event.primaryId);
    const b = byId.get(event.secondaryId);
    if (!a || !b) return [];
    const out: { m: number; d: number }[] = [];
    for (let i = 0; i < N; i++) {
      const t = event.tcaMs - HALF_MS + (i * 2 * HALF_MS) / (N - 1);
      const pa = propagateEci(a.satrec, new Date(t));
      const pb = propagateEci(b.satrec, new Date(t));
      if (pa && pb) out.push({ m: (t - event.tcaMs) / 60_000, d: Math.hypot(pa.r[0] - pb.r[0], pa.r[1] - pb.r[1], pa.r[2] - pb.r[2]) });
    }
    return out;
  }, [event, byId]);

  if (data.length < 2) return null;
  // Log scale keeps both the minimum (km) and the far tails (thousands of km) readable.
  const yMin = Math.max(0.01, Math.min(...data.map((p) => p.d)) / 2);
  const yMax = Math.max(...data.map((p) => p.d));
  const ly = (d: number) => Math.log10(Math.max(d, yMin));
  const x = (m: number) => PAD.l + ((m + 10) / 20) * (W - PAD.l - PAD.r);
  const y = (d: number) => PAD.t + (1 - (ly(d) - ly(yMin)) / (ly(yMax) - ly(yMin) || 1)) * (H - PAD.t - PAD.b);
  const path = data.map((p, i) => `${i ? 'L' : 'M'}${x(p.m).toFixed(1)},${y(p.d).toFixed(1)}`).join('');
  const color = event.minDistanceKm < SCREENING.tightThresholdKm ? COLORS.tight : COLORS.approach;
  const ticks = [1, 10, 100, 1000, 10000].filter((t) => t >= yMin && t <= yMax);

  return (
    <figure className="m-0">
      <figcaption className="label mb-1">{en.proximity.chartTitle}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${en.proximity.chartTitle}: minimum ${event.minDistanceKm.toFixed(2)} km`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="rgba(138,155,184,0.18)" />
            <text x={PAD.l - 4} y={y(t) + 3} textAnchor="end" className="chart-text">
              {t >= 1000 ? `${t / 1000}k` : t}
            </text>
          </g>
        ))}
        {thresholdKm >= yMin && thresholdKm <= yMax && (
          <line x1={PAD.l} x2={W - PAD.r} y1={y(thresholdKm)} y2={y(thresholdKm)} stroke={COLORS.approach} strokeDasharray="3 3" opacity={0.7} />
        )}
        <line x1={x(0)} x2={x(0)} y1={PAD.t} y2={H - PAD.b} stroke="rgba(230,237,247,0.35)" />
        {[-10, -5, 0, 5, 10].map((m) => (
          <text key={m} x={x(m)} y={H - 8} textAnchor="middle" className="chart-text">
            {m}
          </text>
        ))}
        <path d={path} fill="none" stroke={color} strokeWidth={1.6} />
        <circle cx={x(0)} cy={y(event.minDistanceKm)} r={3} fill={color} />
        <text x={x(0) + 6} y={y(event.minDistanceKm) - 4} className="chart-text" fill={color}>
          {event.minDistanceKm.toFixed(2)} km
        </text>
      </svg>
      <div className="chart-text text-center">{en.proximity.chartAxis} · km (log)</div>
    </figure>
  );
}

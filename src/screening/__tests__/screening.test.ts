/**
 * Screening tests (SPEC Phase 4): synthetic crossing orbits must produce an
 * event with the right TCA (± 2 s), plus pre-filter and co-location rules.
 */
import { describe, expect, it } from 'vitest';
import { ommToRecord } from '../../data/catalog';
import { tleToOmm } from '../../data/tle';
import { syntheticCrossingPair } from '../synthetic';
import { bandsOverlap, altitudeBand } from '../prefilter';
import { pairsAllVsAll, pairsPrimaryVsOthers, refineMinimum, screenPairs, type ScreeningObject } from '../closeApproach';
import { propagateEci } from '../../orbital/propagate';
import type { OmmRecord } from '../../types/orbital';

function toObject(omm: OmmRecord): ScreeningObject {
  const r = ommToRecord(omm, 'test')!;
  return {
    id: r.noradId,
    name: r.name,
    satrec: r.satrec,
    epochMs: r.epoch.getTime(),
    meanMotionRevPerDay: r.meanMotionRevPerDay,
    eccentricity: r.eccentricity,
    elementsKey: [omm.EPOCH, omm.MEAN_MOTION, omm.ECCENTRICITY, omm.INCLINATION, omm.RA_OF_ASC_NODE, omm.ARG_OF_PERICENTER, omm.MEAN_ANOMALY].join('|'),
  };
}

const CROSSING = Date.UTC(2026, 9, 25, 12, 0, 0);
const START = CROSSING - 3 * 3600_000;

/** Brute-force reference: 0.05 s scan around the expected crossing. */
function bruteForceTca(a: ScreeningObject, b: ScreeningObject, centerMs: number): { tMs: number; dKm: number } {
  let best = { tMs: centerMs, dKm: Infinity };
  for (let t = centerMs - 60_000; t <= centerMs + 60_000; t += 50) {
    const pa = propagateEci(a.satrec, new Date(t))!;
    const pb = propagateEci(b.satrec, new Date(t))!;
    const d = Math.hypot(pa.r[0] - pb.r[0], pa.r[1] - pb.r[1], pa.r[2] - pb.r[2]);
    if (d < best.dKm) best = { tMs: t, dKm: d };
  }
  return best;
}

describe('synthetic crossing orbits (DECISIONS D8)', () => {
  const [ommA, ommB] = syntheticCrossingPair({ crossingMs: CROSSING });
  const a = toObject(ommA);
  const b = toObject(ommB);
  const params = { startMs: START, windowHours: 6, stepS: 30, thresholdKm: 10, marginKm: 10 };

  it('finds the designed close approach with TCA within ±2 s', () => {
    const events = screenPairs([a, b], [[0, 1]], params);
    const ev = events.find((e) => Math.abs(e.tcaMs - CROSSING) < 120_000);
    expect(ev).toBeDefined();
    expect(Math.abs(ev!.tcaMs - CROSSING)).toBeLessThanOrEqual(2000);
    expect(ev!.minDistanceKm).toBeLessThan(10);
    // Inclinations 53° and 97.5° at the node: relative speed ≈ 2 v sin(Δi/2) ≈ 5.7 km/s.
    expect(ev!.relSpeedKmS).toBeGreaterThan(5);
    expect(ev!.relSpeedKmS).toBeLessThan(6.5);
    expect(ev!.primaryAgeDays).toBeCloseTo(10 / 1440, 3);
  });

  it('agrees with a brute-force 50 ms scan', () => {
    const ref = bruteForceTca(a, b, CROSSING);
    const fine = refineMinimum(a.satrec, b.satrec, CROSSING - 30_000, CROSSING + 30_000);
    expect(Math.abs(fine.tMs - ref.tMs)).toBeLessThan(100);
    expect(Math.abs(fine.dKm - ref.dKm)).toBeLessThan(0.05);
  });

  it('does not report an event when the threshold is below the miss distance', () => {
    const [oA, oB] = syntheticCrossingPair({ crossingMs: CROSSING, offsetBSeconds: 4 });
    // 4 s along-track offset at 7.6 km/s → miss distance ≈ 20–30 km.
    const events = screenPairs([toObject(oA), toObject(oB)], [[0, 1]], { ...params, thresholdKm: 10 });
    expect(events.filter((e) => Math.abs(e.tcaMs - CROSSING) < 120_000)).toHaveLength(0);
    const wide = screenPairs([toObject(oA), toObject(oB)], [[0, 1]], { ...params, thresholdKm: 50 });
    expect(wide.some((e) => Math.abs(e.tcaMs - CROSSING) < 120_000)).toBe(true);
  });
});

describe('pre-filter and set construction', () => {
  const iss = tleToOmm(
    'ISS (ZARYA)',
    '1 25544U 98067A   26297.20915682  .00007800  00000+0  14938-3 0  9991',
    '2 25544  51.6335  21.6229 0006884 302.9098  57.1228 15.49030149591752',
  );
  const poisk = { ...iss, OBJECT_NAME: 'POISK', NORAD_CAT_ID: 36086 };
  const geo = { ...iss, OBJECT_NAME: 'GEO SAT', NORAD_CAT_ID: 40000, MEAN_MOTION: 1.0027, ECCENTRICITY: 0.0002 };

  it('rejects pairs whose altitude bands do not overlap', () => {
    expect(bandsOverlap(altitudeBand(15.49, 0.0007), altitudeBand(1.0027, 0.0002), 10)).toBe(false);
    expect(bandsOverlap(altitudeBand(15.49, 0.0007), altitudeBand(15.45, 0.001), 10)).toBe(true);
  });

  it('excludes co-located objects (identical elements, e.g. docked modules)', () => {
    const objs = [iss, poisk, geo].map(toObject);
    const all = pairsAllVsAll(objs, 10);
    expect(all.pairs).toHaveLength(0);
    expect(all.colocated).toBe(1);
    const prim = pairsPrimaryVsOthers(objs, 0, 10, 500);
    expect(prim.pairs).toHaveLength(0);
    expect(prim.colocated).toBe(1);
  });
});

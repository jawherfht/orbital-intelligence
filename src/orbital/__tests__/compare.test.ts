/**
 * Validation & freshness checks and cross-source comparisons (DECISIONS D28).
 */
import { describe, expect, it } from 'vitest';
import { tleToOmm } from '../../data/tle';
import { ommToRecord } from '../../data/catalog';
import { freshness, normalizeOmm, validateOmm, epochMs } from '../../data/validation';
import { compareElementSets, compareWithN2yo, greatCircleKm } from '../compare';
import { stateAt } from '../propagate';
import type { N2yoPosition } from '../../types/sources';

const issOmm = tleToOmm(
  'ISS (ZARYA)',
  '1 25544U 98067A   26297.20915682  .00007800  00000+0  14938-3 0  9991',
  '2 25544  51.6335  21.6229 0006884 302.9098  57.1228 15.49030149591752',
);
const iss = ommToRecord(issOmm, 'stations')!;
const T0 = epochMs(issOmm.EPOCH);

describe('validation', () => {
  it('accepts a real element set and rejects broken ones', () => {
    expect(validateOmm(issOmm, T0).ok).toBe(true);
    expect(validateOmm({ ...issOmm, ECCENTRICITY: 1.2 }, T0).errors).toContain('ECCENTRICITY out of [0, 1)');
    expect(validateOmm({ ...issOmm, INCLINATION: 200 }, T0).ok).toBe(false);
    expect(validateOmm({ ...issOmm, MEAN_MOTION: 25 }, T0).ok).toBe(false);
    expect(validateOmm({ ...issOmm, EPOCH: 'not a date' }, T0).ok).toBe(false);
    expect(validateOmm(issOmm, T0 - 3 * 86_400_000).errors).toContain('EPOCH is more than 1 day in the future');
  });

  it('normalises string-typed OMM (Space-Track) to numbers', () => {
    const asStrings = Object.fromEntries(Object.entries(issOmm).map(([k, v]) => [k, String(v)]));
    const n = normalizeOmm(asStrings);
    expect(n).toEqual(issOmm);
  });

  it('classifies freshness', () => {
    expect(freshness(issOmm.EPOCH, T0 + 86_400_000).level).toBe('fresh');
    expect(freshness(issOmm.EPOCH, T0 + 5 * 86_400_000).level).toBe('aging');
    expect(freshness(issOmm.EPOCH, T0 + 10 * 86_400_000).level).toBe('stale');
    expect(freshness(issOmm.EPOCH, T0 - 86_400_000).level).toBe('future');
  });
});

describe('element-set comparison', () => {
  it('identical sets → zero difference', () => {
    const c = compareElementSets(issOmm, iss.satrec, issOmm, iss.satrec, T0 + 3_600_000);
    expect(c.sameElementSet).toBe(true);
    expect(c.positionDiffKm).toBeCloseTo(0, 6);
  });

  it('a mean anomaly offset of 0.1° → ~12 km along-track', () => {
    const shifted = { ...issOmm, MEAN_ANOMALY: issOmm.MEAN_ANOMALY + 0.1 };
    const other = ommToRecord(shifted, 'stations')!;
    const c = compareElementSets(issOmm, iss.satrec, shifted, other.satrec, T0);
    // 0.1° of a 6 790 km orbit ≈ 11.9 km
    expect(c.positionDiffKm!).toBeGreaterThan(10);
    expect(c.positionDiffKm!).toBeLessThan(14);
    expect(c.sameElementSet).toBe(false);
  });

  it('RAAN differences wrap around 360°', () => {
    const a = { ...issOmm, RA_OF_ASC_NODE: 359.9 };
    const b = { ...issOmm, RA_OF_ASC_NODE: 0.1 };
    expect(compareElementSets(a, iss.satrec, b, iss.satrec, T0).dRaanDeg).toBeCloseTo(0.2, 6);
  });
});

describe('N2YO position comparison', () => {
  it('great-circle distance: 1° of latitude at the surface ≈ 111.3 km', () => {
    expect(greatCircleKm(0, 0, 1, 0)).toBeCloseTo(111.32, 1);
  });

  it('measures horizontal and altitude differences at each timestamp', () => {
    // Positions built from our own SGP4 (so the expected difference is known), shifted by 0.5° in latitude and 2 km in altitude.
    const positions: N2yoPosition[] = [0, 1, 2].map((s) => {
      const t = T0 + s * 1000;
      const st = stateAt(iss.satrec, new Date(t))!;
      return { satlatitude: st.latDeg + 0.5, satlongitude: st.lonDeg, sataltitude: st.altKm - 2, azimuth: 0, elevation: 0, ra: 0, dec: 0, timestamp: t / 1000 };
    });
    const c = compareWithN2yo(iss.satrec, positions);
    expect(c.samples).toBe(3);
    expect(c.meanHorizontalKm).toBeGreaterThan(58); // 0.5° at r ≈ 6 795 km ≈ 59.3 km
    expect(c.meanHorizontalKm).toBeLessThan(61);
    expect(c.meanAltitudeDiffKm).toBeCloseTo(2, 3);
  });
});

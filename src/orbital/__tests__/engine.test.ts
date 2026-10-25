/**
 * Orbital engine tests (SPEC Phase 2): ISS plausibility, GEO period,
 * SGP4 error handling, and exactness of the TLE → OMM conversion.
 */
import { describe, expect, it } from 'vitest';
import { twoline2satrec } from 'satellite.js';
import { parseTleFile, tleToOmm, tleEpochToIso } from '../../data/tle';
import { buildCatalog, inferCategory, ommToRecord, searchCatalog } from '../../data/catalog';
import { propagateEci, stateAt } from '../propagate';
import { deriveElements, periodMinutes } from '../derived';
import { sampleOrbit, splitPolyline } from '../orbitPath';

// Real element sets from CelesTrak (via the mirror), 2026-10-24.
const ISS = [
  'ISS (ZARYA)',
  '1 25544U 98067A   26297.20915682  .00007800  00000+0  14938-3 0  9991',
  '2 25544  51.6335  21.6229 0006884 302.9098  57.1228 15.49030149591752',
] as const;
const CALSPHERE = [
  'CALSPHERE 1',
  '1 00900U 64063C   26297.12843975  .00000533  00000+0  53205-3 0  9991',
  '2 00900  90.2217  74.7570 0024646 260.3715 274.4589 13.76741410 89165',
] as const;

const issOmm = tleToOmm(...ISS);
const issEpoch = new Date(`${issOmm.EPOCH}Z`);

describe('TLE → OMM conversion (DECISIONS D20)', () => {
  it('decodes every field', () => {
    expect(issOmm.NORAD_CAT_ID).toBe(25544);
    expect(issOmm.OBJECT_ID).toBe('1998-067A');
    expect(issOmm.EPOCH.startsWith('2026-10-24T05:01:11.149')).toBe(true);
    expect(issOmm.INCLINATION).toBeCloseTo(51.6335, 6);
    expect(issOmm.ECCENTRICITY).toBeCloseTo(0.0006884, 10);
    expect(issOmm.MEAN_MOTION).toBeCloseTo(15.49030149, 8);
    expect(issOmm.BSTAR).toBeCloseTo(0.14938e-3, 12);
    expect(issOmm.MEAN_MOTION_DOT).toBeCloseTo(0.000078, 10);
    expect(issOmm.REV_AT_EPOCH).toBe(59175);
  });

  // json2satrec parses EPOCH through Date (millisecond precision) whereas the TLE
  // epoch keeps ~0.01 ms: a sub-millisecond epoch shift is a few metres along-track.
  it('gives the same SGP4 positions as twoline2satrec (within 5 m)', () => {
    for (const tle of [ISS, CALSPHERE]) {
      const fromTle = twoline2satrec(tle[1], tle[2]);
      const rec = ommToRecord(tleToOmm(tle[0], tle[1], tle[2]), 'test');
      expect(rec).not.toBeNull();
      for (const hours of [0, 6, 24, 72]) {
        const d = new Date(issEpoch.getTime() + hours * 3600_000);
        const a = propagateEci(fromTle, d)!;
        const b = propagateEci(rec!.satrec, d)!;
        expect(Math.hypot(a.r[0] - b.r[0], a.r[1] - b.r[1], a.r[2] - b.r[2])).toBeLessThan(0.005);
      }
    }
  });

  it('rejects corrupted lines (checksum) and keeps the rest of the file', () => {
    const bad = ISS[1].slice(0, 68) + '0';
    const { records, skipped } = parseTleFile([...ISS, CALSPHERE[0], bad, CALSPHERE[2]].join('\n'));
    expect(records).toHaveLength(1);
    expect(skipped).toBe(1);
  });

  it('formats epochs with microseconds', () => {
    expect(tleEpochToIso(26, 1.5)).toBe('2026-01-01T12:00:00.000000');
    expect(tleEpochToIso(99, 365)).toBe('1999-12-31T00:00:00.000000');
  });
});

describe('ISS plausibility (SPEC M3)', () => {
  it('altitude ≈ 400–430 km and period ≈ 92–93 min', () => {
    const rec = ommToRecord(issOmm, 'stations')!;
    const d = deriveElements(rec.meanMotionRevPerDay, rec.eccentricity);
    expect(d.periodMin).toBeGreaterThan(92);
    expect(d.periodMin).toBeLessThan(93);
    expect(d.orbitClass).toBe('LEO');
    for (let m = 0; m < 93; m += 10) {
      const s = stateAt(rec.satrec, new Date(issEpoch.getTime() + m * 60_000))!;
      expect(s.altKm).toBeGreaterThan(395);
      expect(s.altKm).toBeLessThan(435);
      expect(s.speedKmS).toBeGreaterThan(7.6);
      expect(s.speedKmS).toBeLessThan(7.75);
      // Geodetic latitude can exceed the inclination by ~0.2° (Earth flattening).
      expect(Math.abs(s.latDeg)).toBeLessThanOrEqual(52);
    }
  });
});

describe('derived elements', () => {
  it('GEO period ≈ 1436 min and class GEO', () => {
    const n = 1.00273791; // one sidereal day
    expect(periodMinutes(n)).toBeCloseTo(1436.07, 1);
    const d = deriveElements(n, 0.0002);
    expect(d.orbitClass).toBe('GEO');
    expect(d.apogeeKm).toBeGreaterThan(35_700);
    expect(d.perigeeKm).toBeLessThan(35_850);
  });

  it('classifies HEO by eccentricity and MEO by altitude', () => {
    expect(deriveElements(2.0, 0.7).orbitClass).toBe('HEO'); // Molniya-like
    expect(deriveElements(2.0056, 0.01).orbitClass).toBe('MEO'); // GPS-like
  });
});

describe('SGP4 errors are skipped and counted (SPEC M2)', () => {
  it('drops an invalid element set', () => {
    const broken = { ...issOmm, NORAD_CAT_ID: 99999, ECCENTRICITY: 1.3 };
    const decaying = { ...issOmm, NORAD_CAT_ID: 99998, MEAN_MOTION: 16.4, BSTAR: 0.9, MEAN_MOTION_DOT: 0.5 };
    const checkAt = new Date(issEpoch.getTime() + 30 * 86400_000);
    const res = buildCatalog([{ group: 'test', omm: [issOmm, broken, decaying] }], checkAt);
    expect(res.records.map((r) => r.noradId)).toEqual([25544]);
    expect(res.skipped).toBe(2);
  });

  it('de-duplicates objects present in several groups (first group wins)', () => {
    const res = buildCatalog(
      [
        { group: 'stations', omm: [issOmm] },
        { group: 'visual', omm: [issOmm] },
      ],
      issEpoch,
    );
    expect(res.records).toHaveLength(1);
    expect(res.records[0]!.group).toBe('stations');
    expect(res.duplicates).toBe(1);
  });
});

describe('category inference (DECISIONS D12)', () => {
  it('uses catalogue naming conventions', () => {
    expect(inferCategory('ISS (ZARYA)', 'stations')).toBe('station');
    expect(inferCategory('CZ-4C R/B', 'stations')).toBe('rocket_body');
    expect(inferCategory('FENGYUN 1C DEB', 'weather')).toBe('debris');
    expect(inferCategory('NOAA 19', 'weather')).toBe('payload');
  });
});

describe('search (SPEC M4)', () => {
  const recs = [ommToRecord(issOmm, 'stations')!, ommToRecord(tleToOmm(...CALSPHERE), 'test')!];
  it('matches names partially and case-insensitively', () => {
    expect(searchCatalog(recs, 'zar').map((r) => r.noradId)).toEqual([25544]);
    expect(searchCatalog(recs, 'iss').map((r) => r.noradId)).toEqual([25544]);
  });
  it('matches exact NORAD ids', () => {
    expect(searchCatalog(recs, '900').map((r) => r.noradId)).toEqual([900]);
  });
  it('returns nothing for an unknown query', () => {
    expect(searchCatalog(recs, 'zzzz')).toEqual([]);
  });
});

describe('orbit path (SPEC M6)', () => {
  it('samples ±1 period and closes on itself', () => {
    const rec = ommToRecord(issOmm, 'stations')!;
    const periodMs = periodMinutes(rec.meanMotionRevPerDay) * 60_000;
    const s = sampleOrbit(rec.satrec, issEpoch.getTime(), periodMs, periodMs, 181);
    expect(s).toHaveLength(181);
    const first = s[0]!.scene;
    const last = s[180]!.scene;
    // After two periods the satellite is back near its start (inertial frame, small drift from J2/drag).
    expect(Math.hypot(first[0] - last[0], first[1] - last[1], first[2] - last[2]) * 6378).toBeLessThan(150);
  });

  it('splits polylines at gaps', () => {
    const parts = splitPolyline(
      [
        [0, 0, 0],
        [0.1, 0, 0],
        [5, 0, 0],
        [5.1, 0, 0],
      ],
      1,
    );
    expect(parts).toHaveLength(2);
  });
});

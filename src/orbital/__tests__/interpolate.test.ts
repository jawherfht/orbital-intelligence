/**
 * Hermite interpolation accuracy (DECISIONS D11): at ×600 with 4 Hz worker
 * sampling, samples are 150 s apart; the on-screen error must stay well under 5 km.
 */
import { describe, expect, it } from 'vitest';
import { tleToOmm } from '../../data/tle';
import { ommToRecord } from '../../data/catalog';
import { propagateEci } from '../propagate';
import { hermiteInto } from '../interpolate';

const iss = ommToRecord(
  tleToOmm(
    'ISS (ZARYA)',
    '1 25544U 98067A   26297.20915682  .00007800  00000+0  14938-3 0  9991',
    '2 25544  51.6335  21.6229 0006884 302.9098  57.1228 15.49030149591752',
  ),
  'stations',
)!;

function maxError(stepS: number, hermite: boolean): number {
  const t0 = iss.epoch.getTime();
  const t1 = t0 + stepS * 1000;
  const a = propagateEci(iss.satrec, new Date(t0))!;
  const b = propagateEci(iss.satrec, new Date(t1))!;
  const out = new Float64Array(3);
  let worst = 0;
  for (let k = 1; k < 20; k++) {
    // Whole milliseconds: Date truncates fractions (0.5 ms ≈ 4 m at 7.7 km/s).
    const t = t0 + Math.round((k / 20) * (t1 - t0));
    if (hermite) hermiteInto(out, 0, a.r, a.v, b.r, b.v, 0, t0, t1, t);
    else for (let j = 0; j < 3; j++) out[j] = a.r[j]! + ((b.r[j]! - a.r[j]!) * (t - t0)) / (t1 - t0);
    const e = propagateEci(iss.satrec, new Date(t))!;
    worst = Math.max(worst, Math.hypot(out[0]! - e.r[0], out[1]! - e.r[1], out[2]! - e.r[2]));
  }
  return worst;
}

describe('interpolation between worker samples', () => {
  it('linear interpolation would exceed 5 km at ×600 (why Hermite is used)', () => {
    expect(maxError(150, false)).toBeGreaterThan(5);
  });
  it('Hermite stays under 0.1 km at ×600 and under 1 m at ×1', () => {
    expect(maxError(150, true)).toBeLessThan(0.1);
    expect(maxError(0.2, true)).toBeLessThan(0.001);
  });
});

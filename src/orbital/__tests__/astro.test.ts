import { describe, expect, it } from 'vitest';
import { gmstAt, sunDirectionScene } from '../astro';
import { latLonToEarthFixedScene, rotateByGmst } from '../frames';

/**
 * Subsolar point sanity check against almanac values. On 25 October the Sun's
 * declination is about -12.2° and the equation of time about +16 min: at 11:00 UTC
 * the apparent solar time on the Greenwich meridian is 11:16, so the Sun is 44 min
 * (11°) before local noon there, i.e. the subsolar longitude is about 11°E.
 */
describe('Sun direction', () => {
  it('points at the expected subsolar point', () => {
    const date = new Date('2026-10-25T11:00:00Z');
    const sun = sunDirectionScene(date);
    const subsolar = rotateByGmst(latLonToEarthFixedScene(-12.2, 11), gmstAt(date));
    const dot = sun[0] * subsolar[0] + sun[1] * subsolar[1] + sun[2] * subsolar[2];
    // cos(1°) ≈ 0.99985: within one degree.
    expect(dot).toBeGreaterThan(0.99985);
  });
});

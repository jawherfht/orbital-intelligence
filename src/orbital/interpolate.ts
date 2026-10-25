/**
 * Cubic Hermite interpolation of positions between two SGP4 samples, using
 * the SGP4 velocities as tangents (DECISIONS D11).
 *
 * Linear interpolation of a circular orbit sampled every Δt has a chord error
 * of about r(1 − cos(ωΔt/2)): at ×600 with 4 Hz sampling (Δt = 150 s) that is
 * ~24 km for the ISS. Hermite with exact end-point velocities brings it under
 * 0.1 km (measured by a test and by the debug overlay).
 */

/**
 * Interpolates one object. Positions in km, velocities in km/s, times in ms.
 * Writes x, y, z into `out` at `offset`.
 */
export function hermiteInto(
  out: Float32Array | Float64Array,
  offset: number,
  p0: ArrayLike<number>,
  v0: ArrayLike<number>,
  p1: ArrayLike<number>,
  v1: ArrayLike<number>,
  i: number,
  t0Ms: number,
  t1Ms: number,
  tMs: number,
): void {
  const hS = (t1Ms - t0Ms) / 1000;
  const s = hS > 0 ? (tMs - t0Ms) / (t1Ms - t0Ms) : 0;
  const s2 = s * s;
  const s3 = s2 * s;
  const h00 = 2 * s3 - 3 * s2 + 1;
  const h10 = (s3 - 2 * s2 + s) * hS;
  const h01 = -2 * s3 + 3 * s2;
  const h11 = (s3 - s2) * hS;
  for (let k = 0; k < 3; k++) {
    const j = i * 3 + k;
    out[offset + k] = h00 * p0[j]! + h10 * v0[j]! + h01 * p1[j]! + h11 * v1[j]!;
  }
}

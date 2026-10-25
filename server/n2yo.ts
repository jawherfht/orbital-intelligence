/**
 * N2YO client (position verification, DECISIONS D28).
 *
 * GET https://api.n2yo.com/rest/v1/satellite/positions/{id}/{lat}/{lng}/{alt}/{seconds}/&apiKey={key}
 * returns `info` {satname, satid, transactionscount} and `positions`
 * [{satlatitude, satlongitude, sataltitude, azimuth, elevation, ra, dec, timestamp, eclipsed}],
 * one per second from now, `seconds` ≤ 300. Free tier: 1000 position
 * transactions per hour. N2YO computes these positions itself from its own
 * element sets: they are an independent prediction, not a measurement.
 * The API key stays on the server.
 */
import type { N2yoPosition, N2yoPositionsResponse } from '../src/types/sources.ts';
import { RateLimiter, TtlCache } from './rateLimit.ts';
import { UpstreamError } from './spacetrack.ts';

export const N2YO_BASE = 'https://api.n2yo.com/rest/v1/satellite';
export const N2YO_LIMITS = { positionsPerHour: 1000, maxSeconds: 300 } as const;

export function positionsPath(noradId: number, lat: number, lng: number, altM: number, seconds: number): string {
  return `/positions/${Math.trunc(noradId)}/${lat}/${lng}/${altM}/${Math.trunc(seconds)}/`;
}

/** Validates and keeps only documented fields; rejects error payloads. */
export function parsePositions(json: unknown): Pick<N2yoPositionsResponse, 'info' | 'positions'> {
  const o = json as { error?: unknown; info?: Record<string, unknown>; positions?: unknown };
  if (!o || typeof o !== 'object') throw new UpstreamError('Unexpected N2YO payload', 'upstream');
  if (o.error) throw new UpstreamError(`N2YO: ${String(o.error)}`, 'upstream');
  if (!o.info || !Array.isArray(o.positions)) throw new UpstreamError('N2YO payload without info/positions', 'upstream');
  const positions: N2yoPosition[] = [];
  for (const p of o.positions as Record<string, unknown>[]) {
    const v = {
      satlatitude: Number(p.satlatitude),
      satlongitude: Number(p.satlongitude),
      sataltitude: Number(p.sataltitude),
      azimuth: Number(p.azimuth),
      elevation: Number(p.elevation),
      ra: Number(p.ra),
      dec: Number(p.dec),
      timestamp: Number(p.timestamp),
      eclipsed: p.eclipsed === undefined ? undefined : Boolean(p.eclipsed),
    };
    if (![v.satlatitude, v.satlongitude, v.sataltitude, v.timestamp].every(Number.isFinite)) continue;
    if (Math.abs(v.satlatitude) > 90 || Math.abs(v.satlongitude) > 180) continue;
    positions.push(v);
  }
  if (positions.length === 0) throw new UpstreamError('N2YO returned no usable position', 'upstream');
  return {
    info: {
      satname: String(o.info.satname ?? ''),
      satid: Number(o.info.satid),
      transactionscount: Number(o.info.transactionscount ?? 0),
    },
    positions,
  };
}

export class N2yoClient {
  readonly limiter = new RateLimiter([{ limit: N2YO_LIMITS.positionsPerHour, ms: 3_600_000 }]);
  /** Positions are "from now": a short cache avoids spending transactions on repeated clicks. */
  private cache = new TtlCache<Pick<N2yoPositionsResponse, 'info' | 'positions'>>(30_000);
  private readonly apiKey: string;
  private readonly fetchImpl: typeof fetch;

  constructor(apiKey: string, fetchImpl: typeof fetch = fetch) {
    this.apiKey = apiKey;
    this.fetchImpl = fetchImpl;
  }

  get configured(): boolean {
    return this.apiKey !== '';
  }

  async positions(noradId: number, lat = 0, lng = 0, altM = 0, seconds = 60): Promise<N2yoPositionsResponse> {
    if (!this.configured) throw new UpstreamError('N2YO API key is not configured on the server', 'not-configured', 503);
    const s = Math.min(N2YO_LIMITS.maxSeconds, Math.max(1, Math.trunc(seconds)));
    const path = positionsPath(noradId, lat, lng, altM, s);
    const hit = this.cache.get(path);
    if (hit) return { source: 'n2yo', fetchedAt: new Date(hit.at).toISOString(), cached: true, ...hit.value };
    if (!this.limiter.tryAcquire()) throw new UpstreamError('N2YO hourly transaction limit reached (1000/h)', 'rate-limited', 429);
    const res = await this.fetchImpl(`${N2YO_BASE}${path}&apiKey=${encodeURIComponent(this.apiKey)}`, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new UpstreamError(`N2YO HTTP ${res.status}`, 'upstream');
    const parsed = parsePositions(await res.json());
    this.cache.set(path, parsed);
    return { source: 'n2yo', fetchedAt: new Date().toISOString(), cached: false, ...parsed };
  }
}

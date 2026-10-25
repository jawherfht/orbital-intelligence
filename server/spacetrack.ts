/**
 * Space-Track.org client (secondary source, DECISIONS D28).
 *
 * - Login: POST https://www.space-track.org/ajaxauth/login, form fields
 *   `identity` and `password`; failure returns {"Login":"Failed"}. The
 *   session is the cookie set by that response.
 * - Queries: /basicspacedata/query/class/<class>/<PREDICATE>/<value>/.../format/json
 *   GP fields come back as strings and are normalised with normalizeOmm.
 * - Limits: 30 requests / minute and 300 / hour (Space-Track usage policy,
 *   same values as the python `spacetrack` library). Results are cached for
 *   1 hour so the same data is never re-queried in a loop.
 * Credentials stay on the server; they never reach the browser.
 */
import { normalizeOmm, validateOmm } from '../src/data/validation.ts';
import type { OmmRecord } from '../src/types/orbital.ts';
import { RateLimiter, TtlCache } from './rateLimit.ts';

export const SPACETRACK_BASE = 'https://www.space-track.org';
export const SPACETRACK_LIMITS = { perMinute: 30, perHour: 300 } as const;

export class UpstreamError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(message: string, code: string, status = 502) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

/** Path of a GP query (exported for tests). */
export function gpQueryPath(noradIds: number[], history = false, limit = 1): string {
  const ids = noradIds.map((n) => Math.trunc(n)).join(',');
  const cls = history ? 'gp_history' : 'gp';
  return `/basicspacedata/query/class/${cls}/NORAD_CAT_ID/${ids}/orderby/EPOCH%20desc/limit/${limit}/format/json`;
}

/** Parses a Space-Track GP JSON array; invalid element sets are dropped. */
export function parseGp(json: unknown): OmmRecord[] {
  if (!Array.isArray(json)) throw new UpstreamError('Unexpected Space-Track payload', 'upstream');
  return json
    .filter((r): r is Record<string, unknown> => typeof r === 'object' && r !== null)
    .map(normalizeOmm)
    .filter((o) => validateOmm(o).ok);
}

export class SpaceTrackClient {
  private cookie: string | null = null;
  private loggedInAt = 0;
  readonly limiter = new RateLimiter([
    { limit: SPACETRACK_LIMITS.perMinute, ms: 60_000 },
    { limit: SPACETRACK_LIMITS.perHour, ms: 3_600_000 },
  ]);
  private cache = new TtlCache<OmmRecord[]>(3_600_000);
  private readonly identity: string;
  private readonly password: string;
  private readonly fetchImpl: typeof fetch;

  constructor(identity: string, password: string, fetchImpl: typeof fetch = fetch) {
    this.identity = identity;
    this.password = password;
    this.fetchImpl = fetchImpl;
  }

  get configured(): boolean {
    return this.identity !== '' && this.password !== '';
  }

  private acquire() {
    if (!this.limiter.tryAcquire()) throw new UpstreamError('Space-Track rate limit reached (30/min, 300/h). Try again later.', 'rate-limited', 429);
  }

  private async login(): Promise<void> {
    this.acquire();
    const res = await this.fetchImpl(`${SPACETRACK_BASE}/ajaxauth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ identity: this.identity, password: this.password }).toString(),
      signal: AbortSignal.timeout(30_000),
    });
    const text = await res.text();
    if (!res.ok) throw new UpstreamError(`Space-Track login HTTP ${res.status}`, 'upstream');
    if (/"Login"\s*:\s*"Failed"/.test(text)) throw new UpstreamError('Space-Track login failed: check SPACETRACK_IDENTITY / SPACETRACK_PASSWORD', 'auth', 401);
    const cookies = res.headers.getSetCookie?.() ?? [];
    const cookie = cookies.map((c) => c.split(';')[0]).filter(Boolean).join('; ');
    if (!cookie) throw new UpstreamError('Space-Track login returned no session cookie', 'auth', 401);
    this.cookie = cookie;
    this.loggedInAt = Date.now();
  }

  private async query(path: string, retry = true): Promise<unknown> {
    // Sessions last about 2 hours; renew a little earlier.
    if (!this.cookie || Date.now() - this.loggedInAt > 90 * 60_000) await this.login();
    this.acquire();
    const res = await this.fetchImpl(`${SPACETRACK_BASE}${path}`, {
      headers: { Cookie: this.cookie ?? '' },
      signal: AbortSignal.timeout(30_000),
    });
    if (res.status === 401 && retry) {
      this.cookie = null;
      return this.query(path, false);
    }
    if (!res.ok) throw new UpstreamError(`Space-Track HTTP ${res.status}`, 'upstream');
    return res.json();
  }

  /** Latest GP element set(s) for one object, or its history (most recent first). */
  async gp(noradId: number, history = false, limit = 1): Promise<{ records: OmmRecord[]; cached: boolean; at: number }> {
    if (!this.configured) throw new UpstreamError('Space-Track credentials are not configured on the server', 'not-configured', 503);
    const path = gpQueryPath([noradId], history, limit);
    const hit = this.cache.get(path);
    if (hit) return { records: hit.value, cached: true, at: hit.at };
    const records = parseGp(await this.query(path));
    this.cache.set(path, records);
    return { records, cached: false, at: Date.now() };
  }
}

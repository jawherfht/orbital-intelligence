/**
 * Server-side source clients (DECISIONS D28). No network: `fetch` is stubbed
 * with responses that follow the documented formats. The element values come
 * from the real CelesTrak ISS element set used elsewhere in the tests; only
 * the transport (string fields, cookies) is reproduced here.
 */
import { describe, expect, it } from 'vitest';
import { SpaceTrackClient, gpQueryPath, parseGp } from '../spacetrack';
import { N2yoClient, parsePositions, positionsPath } from '../n2yo';
import { RateLimiter, TtlCache } from '../rateLimit';

// Space-Track returns every GP field as a string.
const ISS_GP_STRINGS = {
  OBJECT_NAME: 'ISS (ZARYA)',
  OBJECT_ID: '1998-067A',
  EPOCH: '2026-10-24T05:01:11.149248',
  MEAN_MOTION: '15.49030149',
  ECCENTRICITY: '0.00068840',
  INCLINATION: '51.6335',
  RA_OF_ASC_NODE: '21.6229',
  ARG_OF_PERICENTER: '302.9098',
  MEAN_ANOMALY: '57.1228',
  EPHEMERIS_TYPE: '0',
  CLASSIFICATION_TYPE: 'U',
  NORAD_CAT_ID: '25544',
  ELEMENT_SET_NO: '999',
  REV_AT_EPOCH: '59175',
  BSTAR: '0.00014938000000',
  MEAN_MOTION_DOT: '0.00007800',
  MEAN_MOTION_DDOT: '0.0000000000000',
};

function jsonResponse(body: unknown, init: { status?: number; cookies?: string[] } = {}): Response {
  const headers = new Headers({ 'content-type': 'application/json' });
  for (const c of init.cookies ?? []) headers.append('set-cookie', c);
  return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

describe('Space-Track client', () => {
  it('builds documented query paths', () => {
    expect(gpQueryPath([25544])).toBe('/basicspacedata/query/class/gp/NORAD_CAT_ID/25544/orderby/EPOCH%20desc/limit/1/format/json');
    expect(gpQueryPath([25544], true, 10)).toContain('/class/gp_history/NORAD_CAT_ID/25544/orderby/EPOCH%20desc/limit/10/');
  });

  it('normalises string fields to numbers and drops invalid sets', () => {
    const recs = parseGp([ISS_GP_STRINGS, { ...ISS_GP_STRINGS, ECCENTRICITY: '1.5' }]);
    expect(recs).toHaveLength(1);
    expect(recs[0]!.NORAD_CAT_ID).toBe(25544);
    expect(recs[0]!.MEAN_MOTION).toBeCloseTo(15.49030149, 8);
  });

  it('logs in with identity/password, sends the session cookie, caches 1 h', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fake = (async (url: string | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      if (String(url).endsWith('/ajaxauth/login')) return jsonResponse('', { cookies: ['chocolatechip=abc123; path=/; HttpOnly'] });
      return jsonResponse([ISS_GP_STRINGS]);
    }) as typeof fetch;
    const st = new SpaceTrackClient('user@example.org', 'secret', fake);
    const first = await st.gp(25544);
    const second = await st.gp(25544);
    expect(first.records[0]!.OBJECT_NAME).toBe('ISS (ZARYA)');
    expect(first.cached).toBe(false);
    expect(second.cached).toBe(true);
    expect(calls).toHaveLength(2); // one login, one query
    expect(String(calls[0]!.init?.body)).toBe('identity=user%40example.org&password=secret');
    expect((calls[1]!.init?.headers as Record<string, string>).Cookie).toBe('chocolatechip=abc123');
  });

  it('reports failed logins without leaking the password', async () => {
    const fake = (async () => jsonResponse({ Login: 'Failed' })) as unknown as typeof fetch;
    const st = new SpaceTrackClient('u', 'very-secret', fake);
    await expect(st.gp(25544)).rejects.toThrow(/login failed/i);
    await expect(st.gp(25544)).rejects.not.toThrow(/very-secret/);
  });

  it('refuses to run without credentials', async () => {
    await expect(new SpaceTrackClient('', '').gp(25544)).rejects.toMatchObject({ code: 'not-configured' });
  });
});

describe('N2YO client', () => {
  const sample = {
    info: { satname: 'SPACE STATION', satid: 25544, transactionscount: 3 },
    positions: [
      { satlatitude: 12.5, satlongitude: -45.2, sataltitude: 418.3, azimuth: 10, elevation: -40, ra: 100, dec: 5, timestamp: 1793000000, eclipsed: false },
      { satlatitude: 999, satlongitude: 0, sataltitude: 418, azimuth: 0, elevation: 0, ra: 0, dec: 0, timestamp: 1793000001 },
    ],
  };

  it('builds the documented positions path', () => {
    expect(positionsPath(25544, 41.702, -76.014, 0, 2)).toBe('/positions/25544/41.702/-76.014/0/2/');
  });

  it('keeps valid positions only and rejects error payloads', () => {
    expect(parsePositions(sample).positions).toHaveLength(1);
    expect(() => parsePositions({ error: 'Invalid API Key!' })).toThrow(/Invalid API Key/);
  });

  it('puts the key in the query, caches 30 s and counts transactions', async () => {
    const urls: string[] = [];
    const fake = (async (url: string | URL) => {
      urls.push(String(url));
      return jsonResponse(sample);
    }) as typeof fetch;
    const c = new N2yoClient('KEY-123', fake);
    const a = await c.positions(25544, 0, 0, 0, 500);
    const b = await c.positions(25544, 0, 0, 0, 500);
    expect(urls).toHaveLength(1);
    expect(urls[0]).toBe('https://api.n2yo.com/rest/v1/satellite/positions/25544/0/0/0/300/&apiKey=KEY-123');
    expect(a.cached).toBe(false);
    expect(b.cached).toBe(true);
    expect(c.limiter.used(3_600_000)).toBe(1);
  });
});

describe('rate limiter and cache', () => {
  it('enforces every window', () => {
    let t = 0;
    const rl = new RateLimiter(
      [
        { limit: 2, ms: 1000 },
        { limit: 3, ms: 10_000 },
      ],
      () => t,
    );
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(true);
    expect(rl.tryAcquire()).toBe(false); // 2 per second
    t = 1500;
    expect(rl.tryAcquire()).toBe(true);
    t = 3000;
    expect(rl.tryAcquire()).toBe(false); // 3 per 10 s
    t = 10_500;
    expect(rl.tryAcquire()).toBe(true);
  });

  it('expires cache entries', () => {
    let t = 0;
    const c = new TtlCache<number>(100, () => t);
    c.set('a', 1);
    expect(c.get('a')?.value).toBe(1);
    t = 101;
    expect(c.get('a')).toBeUndefined();
  });
});

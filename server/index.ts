/**
 * Local orbital-data server (DECISIONS D28). Dependency-free Node ≥ 22.
 *
 *   GET /api/orbital/status                          sources configured? usage counters (no secrets)
 *   GET /api/orbital/celestrak/group/:group          CelesTrak OMM JSON (fallback: GitHub mirror of CelesTrak), cached 2 h
 *   GET /api/orbital/spacetrack/gp/:norad            latest Space-Track GP element set, cached 1 h
 *   GET /api/orbital/spacetrack/history/:norad?limit=N   last N element sets (gp_history), cached 1 h
 *   GET /api/orbital/n2yo/positions/:norad?seconds=S&lat=&lng=&alt=   N2YO predicted positions, cached 30 s
 *   anything else                                    the production build in dist/ (npm start)
 *
 * Secrets are read from .env (SPACETRACK_IDENTITY, SPACETRACK_PASSWORD, N2YO_API_KEY)
 * and never sent to the browser or written to logs.
 */
import { createServer, type ServerResponse } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv, readConfig } from './env.ts';
import { SpaceTrackClient, SPACETRACK_LIMITS, UpstreamError } from './spacetrack.ts';
import { N2yoClient, N2YO_LIMITS } from './n2yo.ts';
import { TtlCache } from './rateLimit.ts';
import { SOURCES } from '../src/config.ts';
import { parseTleFile } from '../src/data/tle.ts';
import { normalizeOmm, validateOmm } from '../src/data/validation.ts';
import type { OmmRecord } from '../src/types/orbital.ts';
import type { SourceStatus } from '../src/types/sources.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
loadEnv(join(ROOT, '.env'));
const config = readConfig();
const spacetrack = new SpaceTrackClient(config.spacetrackIdentity, config.spacetrackPassword);
const n2yo = new N2yoClient(config.n2yoApiKey);
const celestrakCache = new TtlCache<{ origin: string; omm: OmmRecord[] }>(2 * 3_600_000);

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function fail(res: ServerResponse, e: unknown) {
  if (e instanceof UpstreamError) return send(res, e.status, { error: e.message, code: e.code });
  const msg = e instanceof Error ? e.message : String(e);
  return send(res, 502, { error: `Upstream request failed: ${msg}`, code: 'upstream' });
}

function noradParam(s: string | undefined): number | null {
  if (!s || !/^\d{1,9}$/.test(s)) return null;
  return Number(s);
}

async function celestrakGroup(group: string): Promise<{ origin: string; omm: OmmRecord[]; cached: boolean; at: number }> {
  const hit = celestrakCache.get(group);
  if (hit) return { ...hit.value, cached: true, at: hit.at };
  let result: { origin: string; omm: OmmRecord[] } | null = null;
  try {
    const r = await fetch(SOURCES.celestrakGroup(group), { headers: { 'User-Agent': 'orbital-intelligence/0.2' }, signal: AbortSignal.timeout(30_000) });
    if (r.ok) {
      const json: unknown = await r.json();
      if (Array.isArray(json) && json.length) result = { origin: 'CelesTrak', omm: json.map((o) => normalizeOmm(o as Record<string, unknown>)) };
    }
  } catch {
    // fall through to the mirror
  }
  if (!result) {
    const file = SOURCES.mirrorFiles[group];
    if (!file) throw new UpstreamError(`CelesTrak unreachable and group "${group}" is not in the mirror`, 'upstream');
    const r = await fetch(`${SOURCES.mirrorRaw}/${file}`, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) throw new UpstreamError(`Mirror HTTP ${r.status}`, 'upstream');
    result = { origin: 'CelesTrak (via GitHub mirror)', omm: parseTleFile(await r.text()).records };
  }
  result.omm = result.omm.filter((o) => validateOmm(o).ok);
  celestrakCache.set(group, result);
  return { ...result, cached: false, at: Date.now() };
}

async function api(res: ServerResponse, url: URL) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api','orbital',...]
  const [, , source, kind, arg] = parts;
  try {
    if (source === 'status') {
      const status: SourceStatus = {
        celestrak: { available: true },
        spacetrack: { configured: spacetrack.configured, requestsLastHour: spacetrack.limiter.used(3_600_000), hourlyLimit: SPACETRACK_LIMITS.perHour },
        n2yo: { configured: n2yo.configured, transactionsLastHour: n2yo.limiter.used(3_600_000), hourlyLimit: N2YO_LIMITS.positionsPerHour },
      };
      return send(res, 200, status);
    }
    if (source === 'celestrak' && kind === 'group' && arg && /^[a-z0-9-]{1,40}$/.test(arg)) {
      const r = await celestrakGroup(arg);
      return send(res, 200, { source: 'celestrak', origin: r.origin, fetchedAt: new Date(r.at).toISOString(), cached: r.cached, records: r.omm });
    }
    if (source === 'spacetrack' && (kind === 'gp' || kind === 'history')) {
      const id = noradParam(arg);
      if (id === null) return send(res, 400, { error: 'Invalid NORAD id', code: 'bad-request' });
      const limit = kind === 'history' ? Math.min(25, Math.max(1, Number(url.searchParams.get('limit') ?? 10))) : 1;
      const r = await spacetrack.gp(id, kind === 'history', limit);
      return send(res, 200, { source: 'space-track', fetchedAt: new Date(r.at).toISOString(), cached: r.cached, records: r.records });
    }
    if (source === 'n2yo' && kind === 'positions') {
      const id = noradParam(arg);
      if (id === null) return send(res, 400, { error: 'Invalid NORAD id', code: 'bad-request' });
      const q = (k: string, d: number, lo: number, hi: number) => {
        const v = Number(url.searchParams.get(k) ?? d);
        return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
      };
      const r = await n2yo.positions(id, q('lat', 0, -90, 90), q('lng', 0, -180, 180), q('alt', 0, -500, 9000), q('seconds', 60, 1, N2YO_LIMITS.maxSeconds));
      return send(res, 200, r);
    }
    return send(res, 404, { error: 'Unknown endpoint', code: 'not-found' });
  } catch (e) {
    return fail(res, e);
  }
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(res: ServerResponse, url: URL) {
  const dist = join(ROOT, 'dist');
  if (!existsSync(dist)) return send(res, 404, { error: 'Run "npm run build" first, or use "npm run dev".', code: 'not-found' });
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  let file = join(dist, rel);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
}

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed', code: 'bad-request' });
  if (url.pathname.startsWith('/api/orbital/')) return void api(res, url);
  return serveStatic(res, url);
}).listen(config.port, config.host, () => {
  console.log(`Orbital data server on http://${config.host}:${config.port}`);
  console.log(`  Space-Track: ${spacetrack.configured ? 'configured' : 'not configured (set SPACETRACK_IDENTITY / SPACETRACK_PASSWORD in .env)'}`);
  console.log(`  N2YO:        ${n2yo.configured ? 'configured' : 'not configured (set N2YO_API_KEY in .env)'}`);
});

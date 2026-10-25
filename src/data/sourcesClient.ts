/**
 * Browser client of the local orbital-data server (server/index.ts).
 * The server holds the Space-Track and N2YO credentials; the browser only
 * sees results. Every call can fail (server not started, source not
 * configured, rate limit): callers show the error, never substitute data.
 */
import type { OmmRecord } from '../types/orbital';
import type { ApiError, N2yoPositionsResponse, SourceStatus, SpaceTrackGpResponse } from '../types/sources';

export const API_BASE = '/api/orbital';

export class SourceError extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.code = code;
  }
}

async function getJson<T>(path: string, timeoutMs = 35_000): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    throw new SourceError('Local data server unreachable — start it with "npm run dev" (or "npm start").', 'server-down');
  }
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('application/json')) throw new SourceError('Local data server unreachable — start it with "npm run dev" (or "npm start").', 'server-down');
  const body = (await res.json()) as T | ApiError;
  if (!res.ok) {
    const e = body as ApiError;
    throw new SourceError(e.error ?? `HTTP ${res.status}`, e.code ?? 'upstream');
  }
  return body as T;
}

export const fetchStatus = () => getJson<SourceStatus>('/status', 5_000);

export const fetchSpaceTrackLatest = (noradId: number) => getJson<SpaceTrackGpResponse>(`/spacetrack/gp/${noradId}`);

export const fetchSpaceTrackHistory = (noradId: number, limit = 10) => getJson<SpaceTrackGpResponse>(`/spacetrack/history/${noradId}?limit=${limit}`);

export const fetchN2yoPositions = (noradId: number, seconds = 60) => getJson<N2yoPositionsResponse>(`/n2yo/positions/${noradId}?seconds=${seconds}`);

export interface ServerGroupResponse {
  source: 'celestrak';
  origin: string;
  fetchedAt: string;
  cached: boolean;
  records: OmmRecord[];
}

export const fetchCelestrakGroupViaServer = (group: string) => getJson<ServerGroupResponse>(`/celestrak/group/${encodeURIComponent(group)}`);

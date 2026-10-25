/**
 * Responses of the local orbital-data server (server/index.ts), shared by
 * the server and the browser. Secrets never appear in these types.
 */
import type { OmmRecord } from './orbital';

export interface SourceStatus {
  celestrak: { available: true };
  spacetrack: { configured: boolean; requestsLastHour: number; hourlyLimit: number };
  n2yo: { configured: boolean; transactionsLastHour: number; hourlyLimit: number };
  agent: { configured: boolean; model: string; autoExecuteKm: number };
}

export interface SpaceTrackGpResponse {
  source: 'space-track';
  fetchedAt: string;
  /** True when served from the server cache (Space-Track asks clients not to re-query the same data). */
  cached: boolean;
  records: OmmRecord[];
}

/** One N2YO predicted position (fields as returned by api.n2yo.com, plus nothing invented). */
export interface N2yoPosition {
  satlatitude: number;
  satlongitude: number;
  /** km */
  sataltitude: number;
  azimuth: number;
  elevation: number;
  ra: number;
  dec: number;
  /** Unix seconds */
  timestamp: number;
  eclipsed?: boolean;
}

export interface N2yoPositionsResponse {
  source: 'n2yo';
  fetchedAt: string;
  cached: boolean;
  info: { satname: string; satid: number; transactionscount: number };
  positions: N2yoPosition[];
}

export interface ApiError {
  error: string;
  /** e.g. "not-configured", "rate-limited", "upstream", "bad-request" */
  code: string;
}

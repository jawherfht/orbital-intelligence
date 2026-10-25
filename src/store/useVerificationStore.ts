/**
 * Multi-source verification of the selected object (DECISIONS D28):
 * CelesTrak (primary, element set in use) vs Space-Track (secondary) vs N2YO
 * (independent predicted positions). Only real API results are stored;
 * failures are kept as messages, never replaced by substitute values.
 */
import { create } from 'zustand';
import type { OmmRecord } from '../types/orbital';
import type { N2yoPositionsResponse, SourceStatus } from '../types/sources';
import { fetchN2yoPositions, fetchSpaceTrackHistory, fetchSpaceTrackLatest, fetchStatus, SourceError } from '../data/sourcesClient';
import { ommToRecord } from '../data/catalog';
import { useOrbitalStore } from './useOrbitalStore';

export interface SourceResult<T> {
  status: 'idle' | 'loading' | 'ok' | 'error';
  data?: T;
  error?: string;
  code?: string;
  fetchedAt?: string;
  cached?: boolean;
}

interface VerificationState {
  noradId: number | null;
  serverStatus: SourceStatus | null;
  serverError: string | null;
  spacetrack: SourceResult<OmmRecord>;
  history: SourceResult<OmmRecord[]>;
  n2yo: SourceResult<N2yoPositionsResponse>;
  refreshStatus: () => Promise<void>;
  verify: (noradId: number) => Promise<void>;
  loadHistory: (noradId: number) => Promise<void>;
  /** Replaces the element set of the object by the Space-Track one (when newer). */
  useSpaceTrackElements: () => boolean;
  reset: () => void;
}

const idle = { status: 'idle' as const };

function asError(e: unknown): { status: 'error'; error: string; code: string } {
  if (e instanceof SourceError) return { status: 'error', error: e.message, code: e.code };
  return { status: 'error', error: (e as Error).message ?? String(e), code: 'unknown' };
}

export const useVerificationStore = create<VerificationState>((set, get) => ({
  noradId: null,
  serverStatus: null,
  serverError: null,
  spacetrack: idle,
  history: idle,
  n2yo: idle,

  refreshStatus: async () => {
    try {
      set({ serverStatus: await fetchStatus(), serverError: null });
    } catch (e) {
      set({ serverStatus: null, serverError: (e as Error).message });
    }
  },

  verify: async (noradId) => {
    set({ noradId, spacetrack: { status: 'loading' }, n2yo: { status: 'loading' }, history: idle });
    await get().refreshStatus();
    const st = get().serverStatus;
    const tasks: Promise<void>[] = [];
    if (st?.spacetrack.configured) {
      tasks.push(
        fetchSpaceTrackLatest(noradId)
          .then((r) => {
            if (get().noradId !== noradId) return;
            const rec = r.records[0];
            set({ spacetrack: rec ? { status: 'ok', data: rec, fetchedAt: r.fetchedAt, cached: r.cached } : { status: 'error', error: 'Space-Track has no valid GP element set for this object', code: 'empty' } });
          })
          .catch((e: unknown) => {
            if (get().noradId === noradId) set({ spacetrack: asError(e) });
          }),
      );
    } else {
      set({ spacetrack: { status: 'error', error: get().serverError ?? 'Space-Track is not configured on the server (.env)', code: get().serverError ? 'server-down' : 'not-configured' } });
    }
    if (st?.n2yo.configured) {
      tasks.push(
        fetchN2yoPositions(noradId, 60)
          .then((r) => {
            if (get().noradId === noradId) set({ n2yo: { status: 'ok', data: r, fetchedAt: r.fetchedAt, cached: r.cached } });
          })
          .catch((e: unknown) => {
            if (get().noradId === noradId) set({ n2yo: asError(e) });
          }),
      );
    } else {
      set({ n2yo: { status: 'error', error: get().serverError ?? 'N2YO is not configured on the server (.env)', code: get().serverError ? 'server-down' : 'not-configured' } });
    }
    await Promise.all(tasks);
    void get().refreshStatus();
  },

  loadHistory: async (noradId) => {
    set({ history: { status: 'loading' } });
    try {
      const r = await fetchSpaceTrackHistory(noradId, 10);
      if (get().noradId === noradId) set({ history: { status: 'ok', data: r.records, fetchedAt: r.fetchedAt, cached: r.cached } });
    } catch (e) {
      if (get().noradId === noradId) set({ history: asError(e) });
    }
  },

  useSpaceTrackElements: () => {
    const { noradId, spacetrack } = get();
    if (noradId === null || !spacetrack.data) return false;
    const orbital = useOrbitalStore.getState();
    const current = orbital.byId.get(noradId);
    if (!current) return false;
    const rec = ommToRecord(spacetrack.data, current.group);
    if (!rec) return false;
    orbital.replaceRecord({ ...rec, elementSource: 'space-track', category: current.category });
    return true;
  },

  reset: () => set({ noradId: null, spacetrack: idle, history: idle, n2yo: idle }),
}));

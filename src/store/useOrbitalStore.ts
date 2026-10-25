/**
 * Catalog, selection and layer filters (SPEC §5).
 * Per-frame positions are NOT stored here (see scene/swarmState.ts) to avoid React re-renders.
 */
import { create } from 'zustand';
import { RENDER } from '../config';
import type { DataSourceInfo, SatelliteCategory, SatelliteRecord, SnapshotManifest } from '../types/orbital';
import { buildCatalog } from '../data/catalog';
import { loadLive, loadSnapshot, type GroupData } from '../data/celestrakClient';
import { getSimDate } from './simulationClock';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface OrbitalState {
  status: LoadStatus;
  error: string | null;
  records: SatelliteRecord[];
  byId: Map<number, SatelliteRecord>;
  /** Bumped whenever `records` changes, so the worker can be re-initialised. */
  catalogVersion: number;
  groups: string[];
  manifest: SnapshotManifest | null;
  source: DataSourceInfo | null;
  skipped: number;
  duplicates: number;
  failures: string[];
  refreshing: boolean;
  refreshMessage: string | null;

  selectedId: number | null;
  /** Secondary object highlighted with the selection (screening pair). */
  secondaryId: number | null;
  hoveredId: number | null;
  hoverScreen: { x: number; y: number } | null;
  /** Incremented to ask the camera to fly to the selection. */
  focusRequest: number;

  hiddenCategories: Set<SatelliteCategory>;
  hiddenGroups: Set<string>;
  showOrbit: boolean;
  showGroundTrack: boolean;
  searchQuery: string;

  loadInitial: (groups?: string[]) => Promise<void>;
  refreshLive: () => Promise<'live' | 'cache' | 'failed'>;
  select: (id: number | null, opts?: { focus?: boolean }) => void;
  setSecondary: (id: number | null) => void;
  setHover: (id: number | null, screen?: { x: number; y: number } | null) => void;
  requestFocus: () => void;
  toggleCategory: (c: SatelliteCategory) => void;
  toggleGroup: (g: string) => void;
  setShowOrbit: (v: boolean) => void;
  setShowGroundTrack: (v: boolean) => void;
  setSearchQuery: (q: string) => void;
  /** Adds or removes the synthetic objects of the simulated scenario (DECISIONS D9). */
  setSimulatedObjects: (recs: SatelliteRecord[]) => void;
}

function indexRecords(records: SatelliteRecord[]) {
  return new Map(records.map((r) => [r.noradId, r]));
}

function applyCatalog(groups: GroupData[]) {
  const { records, skipped, duplicates } = buildCatalog(groups, getSimDate(), RENDER.maxRenderedObjects);
  return { records, skipped, duplicates, byId: indexRecords(records), groups: groups.map((g) => g.group) };
}

export const useOrbitalStore = create<OrbitalState>((set, get) => ({
  status: 'idle',
  error: null,
  records: [],
  byId: new Map(),
  catalogVersion: 0,
  groups: [],
  manifest: null,
  source: null,
  skipped: 0,
  duplicates: 0,
  failures: [],
  refreshing: false,
  refreshMessage: null,

  selectedId: null,
  secondaryId: null,
  hoveredId: null,
  hoverScreen: null,
  focusRequest: 0,

  hiddenCategories: new Set(),
  hiddenGroups: new Set(),
  showOrbit: true,
  showGroundTrack: false,
  searchQuery: '',

  loadInitial: async (groups) => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading', error: null });
    try {
      const snap = await loadSnapshot(groups);
      const cat = applyCatalog(snap.groups);
      set((s) => ({
        ...cat,
        status: 'ready',
        manifest: snap.manifest,
        source: snap.source,
        failures: snap.failures,
        catalogVersion: s.catalogVersion + 1,
      }));
    } catch (e) {
      set({ status: 'error', error: (e as Error).message });
    }
  },

  refreshLive: async () => {
    const { groups, refreshing } = get();
    if (refreshing || groups.length === 0) return 'failed';
    set({ refreshing: true, refreshMessage: null });
    try {
      const res = await loadLive(groups.filter((g) => g !== 'simulated'));
      if (res.groups.length === 0) {
        set({ refreshing: false, refreshMessage: res.failures[0] ?? null });
        return 'failed';
      }
      const simulated = get().records.filter((r) => r.simulated);
      const cat = applyCatalog(res.groups);
      const records = [...cat.records, ...simulated];
      set((s) => ({
        ...cat,
        records,
        byId: indexRecords(records),
        source: res.source,
        failures: res.failures,
        refreshing: false,
        catalogVersion: s.catalogVersion + 1,
        selectedId: s.selectedId !== null && records.some((r) => r.noradId === s.selectedId) ? s.selectedId : null,
      }));
      return res.source.kind === 'cache' ? 'cache' : 'live';
    } catch (e) {
      set({ refreshing: false, refreshMessage: (e as Error).message });
      return 'failed';
    }
  },

  select: (id, opts) => {
    set((s) => ({
      selectedId: id,
      secondaryId: id === null ? null : s.secondaryId,
      focusRequest: opts?.focus === false || id === null ? s.focusRequest : s.focusRequest + 1,
    }));
  },
  setSecondary: (secondaryId) => set({ secondaryId }),
  setHover: (hoveredId, screen = null) => set({ hoveredId, hoverScreen: screen }),
  requestFocus: () => set((s) => ({ focusRequest: s.focusRequest + 1 })),
  toggleCategory: (c) =>
    set((s) => {
      const next = new Set(s.hiddenCategories);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return { hiddenCategories: next };
    }),
  toggleGroup: (g) =>
    set((s) => {
      const next = new Set(s.hiddenGroups);
      if (next.has(g)) next.delete(g);
      else next.add(g);
      return { hiddenGroups: next };
    }),
  setShowOrbit: (showOrbit) => set({ showOrbit }),
  setShowGroundTrack: (showGroundTrack) => set({ showGroundTrack }),
  setSearchQuery: (searchQuery) => set({ searchQuery }),

  setSimulatedObjects: (sim) =>
    set((s) => {
      const records = [...s.records.filter((r) => !r.simulated), ...sim];
      const groups = s.groups.filter((g) => g !== 'simulated');
      if (sim.length) groups.push('simulated');
      const ids = new Set(records.map((r) => r.noradId));
      return {
        records,
        byId: indexRecords(records),
        groups,
        catalogVersion: s.catalogVersion + 1,
        selectedId: s.selectedId !== null && ids.has(s.selectedId) ? s.selectedId : null,
        secondaryId: s.secondaryId !== null && ids.has(s.secondaryId) ? s.secondaryId : null,
      };
    }),
}));

/** True when a record passes the layer filters. */
export function isVisible(r: SatelliteRecord, s: Pick<OrbitalState, 'hiddenCategories' | 'hiddenGroups'>): boolean {
  return !s.hiddenCategories.has(r.category) && !s.hiddenGroups.has(r.group);
}

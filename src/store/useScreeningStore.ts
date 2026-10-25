/**
 * Proximity screening state (SPEC §8.2 O1/O2).
 */
import { create } from 'zustand';
import { SCREENING } from '../config';
import type { CloseApproachEvent, ScreeningStats } from '../screening/closeApproach';
import type { ScreeningMessage, ScreeningRequest } from '../screening/screening.worker';
import ScreeningWorker from '../screening/screening.worker.ts?worker';
import { syntheticCrossingPair } from '../screening/synthetic';
import { ommToRecord } from '../data/catalog';
import { useOrbitalStore } from './useOrbitalStore';
import { useAgentStore } from './useAgentStore';
import { getSimDate, useClock } from './simulationClock';

export type ScreeningMode = 'selected' | 'group';
export type ScreeningStatus = 'idle' | 'running' | 'done' | 'error';

interface ScreeningState {
  mode: ScreeningMode;
  group: string;
  thresholdKm: number;
  windowHours: number;
  status: ScreeningStatus;
  progress: number;
  error: string | null;
  events: CloseApproachEvent[];
  stats: ScreeningStats | null;
  capped: boolean;
  /** Parameters of the last completed run (for the timeline axis). */
  lastRun: { startMs: number; windowHours: number; thresholdKm: number } | null;
  activeEventId: string | null;
  simulatedActive: boolean;
  limitationsOpen: boolean;

  setMode: (m: ScreeningMode) => void;
  setGroup: (g: string) => void;
  setThreshold: (km: number) => void;
  setWindow: (h: number) => void;
  run: () => Promise<CloseApproachEvent[]>;
  cancel: () => void;
  openEvent: (id: string) => void;
  runSimulated: () => Promise<CloseApproachEvent[]>;
  clearSimulated: () => void;
  setLimitationsOpen: (v: boolean) => void;
}

let worker: Worker | null = null;

export const useScreeningStore = create<ScreeningState>((set, get) => ({
  mode: 'selected',
  group: 'starlink',
  thresholdKm: SCREENING.thresholdKmDefault,
  windowHours: SCREENING.windowHoursDefault,
  status: 'idle',
  progress: 0,
  error: null,
  events: [],
  stats: null,
  capped: false,
  lastRun: null,
  activeEventId: null,
  simulatedActive: false,
  limitationsOpen: false,

  setMode: (mode) => set({ mode }),
  setGroup: (group) => set({ group }),
  setThreshold: (km) => set({ thresholdKm: Math.min(SCREENING.thresholdKmMax, Math.max(SCREENING.thresholdKmMin, km)) }),
  setWindow: (h) => set({ windowHours: Math.min(SCREENING.windowHoursMax, Math.max(1, h)) }),

  run: () => {
    get().cancel();
    const { records, selectedId } = useOrbitalStore.getState();
    const { mode, group, thresholdKm, windowHours, simulatedActive } = get();
    let set_ = records;
    let primaryIndex: number | null = null;
    if (simulatedActive) {
      set_ = records.filter((r) => r.simulated);
      primaryIndex = null;
    } else if (mode === 'selected') {
      if (selectedId === null) {
        set({ status: 'error', error: 'select-first' });
        return Promise.resolve([]);
      }
      primaryIndex = set_.findIndex((r) => r.noradId === selectedId);
    } else {
      set_ = records.filter((r) => r.group === group).slice(0, SCREENING.maxGroupObjects);
    }
    const startMs = getSimDate().getTime();
    const req: ScreeningRequest = {
      omm: set_.map((r) => r.omm),
      simulatedIds: set_.filter((r) => r.simulated).map((r) => r.noradId),
      primaryIndex,
      maxOthers: SCREENING.maxOthers,
      params: { startMs, windowHours, stepS: SCREENING.coarseStepS, thresholdKm, marginKm: SCREENING.altitudeMarginKm },
    };
    const groupCapped = mode === 'group' && !simulatedActive && records.filter((r) => r.group === group).length > SCREENING.maxGroupObjects;
    set({ status: 'running', progress: 0, error: null, events: [], stats: null, activeEventId: null });
    return new Promise((resolve) => {
      const w = new ScreeningWorker();
      worker = w;
      w.onmessage = (e: MessageEvent<ScreeningMessage>) => {
        const m = e.data;
        if (m.type === 'progress') {
          set({ progress: m.fraction });
          return;
        }
        w.terminate();
        if (worker === w) worker = null;
        if (m.type === 'error') {
          set({ status: 'error', error: m.message });
          resolve([]);
          return;
        }
        set({
          status: 'done',
          progress: 1,
          events: m.events,
          stats: m.stats,
          capped: m.capped || groupCapped,
          lastRun: { startMs, windowHours, thresholdKm },
        });
        // Decision agent on the closest events (DECISIONS D29); runs in the background.
        if (m.events.length) void useAgentStore.getState().autoAnalyse(m.events, thresholdKm);
        resolve(m.events);
      };
      w.onerror = (e) => {
        set({ status: 'error', error: e.message || 'Worker error' });
        resolve([]);
      };
      w.postMessage(req);
    });
  },

  cancel: () => {
    if (worker) {
      worker.terminate();
      worker = null;
      set({ status: 'idle', progress: 0 });
    }
  },

  openEvent: (id) => {
    const ev = get().events.find((e) => e.id === id);
    if (!ev) return;
    set({ activeEventId: id });
    const clock = useClock.getState();
    clock.setPaused(true);
    clock.setSimTime(ev.tcaMs);
    const orbital = useOrbitalStore.getState();
    orbital.select(ev.primaryId);
    orbital.setSecondary(ev.secondaryId);
  },

  runSimulated: async () => {
    // Synthetic crossing 45 min after the current simulated time (DECISIONS D9).
    const crossing = getSimDate().getTime() + 45 * 60_000;
    const recs = syntheticCrossingPair({ crossingMs: crossing })
      .map((o) => ommToRecord(o, 'simulated'))
      .filter((r): r is NonNullable<typeof r> => r !== null)
      // SIM-A behaves as a manoeuvrable payload and SIM-B as debris, so the decision agent can be demonstrated.
      .map((r, i) => ({ ...r, simulated: true, category: i === 0 ? ('payload' as const) : ('debris' as const) }));
    useOrbitalStore.getState().setSimulatedObjects(recs);
    set({ simulatedActive: true });
    return get().run();
  },

  clearSimulated: () => {
    get().cancel();
    useOrbitalStore.getState().setSimulatedObjects([]);
    useOrbitalStore.getState().setSecondary(null);
    set({ simulatedActive: false, events: [], stats: null, status: 'idle', activeEventId: null, lastRun: null });
  },

  setLimitationsOpen: (limitationsOpen) => set({ limitationsOpen }),
}));

export function activeEvent(s: Pick<ScreeningState, 'events' | 'activeEventId'>): CloseApproachEvent | undefined {
  return s.events.find((e) => e.id === s.activeEventId);
}

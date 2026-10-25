/**
 * One-click demo (SPEC §10). Fully offline: uses the local snapshot.
 * Each step sets a caption; stopping at any time cancels the remaining steps.
 * If real screening finds nothing, the clearly labelled simulated test
 * scenario is used instead (DECISIONS D9).
 */
import { create } from 'zustand';
import { useClock } from './simulationClock';
import { useOrbitalStore } from './useOrbitalStore';
import { useScreeningStore } from './useScreeningStore';
import { useUiStore } from './useUiStore';
import { searchCatalog } from '../data/catalog';

interface DemoState {
  running: boolean;
  step: number;
  /** Caption index into en.demo.steps, or -1 for "done". */
  caption: number | null;
  start: () => void;
  stop: () => void;
}

const ISS_NORAD = 25544;
let token = 0;

export const useDemoStore = create<DemoState>((set, get) => ({
  running: false,
  step: 0,
  caption: null,

  start: () => {
    const my = ++token;
    set({ running: true, step: 0, caption: 0 });
    const alive = () => token === my && get().running;
    const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
    const clock = useClock.getState();
    const orbital = useOrbitalStore.getState();
    const screening = useScreeningStore.getState();
    const ui = useUiStore.getState();

    void (async () => {
      // 1 — overview at ×60
      screening.clearSimulated();
      orbital.select(null);
      clock.goLive();
      useClock.getState().setSpeed(60);
      await wait(6000);
      if (!alive()) return;

      // 2 — search "ISS", select, focus
      set({ step: 1, caption: 1 });
      ui.setRightOpen(true);
      ui.setRightTab('info');
      const type = async (text: string) => {
        for (let i = 1; i <= text.length; i++) {
          useOrbitalStore.getState().setSearchQuery(text.slice(0, i));
          await wait(220);
        }
      };
      await type('ISS');
      await wait(900);
      if (!alive()) return;
      const records = useOrbitalStore.getState().records;
      const iss = records.find((r) => r.noradId === ISS_NORAD) ?? searchCatalog(records, 'ISS')[0];
      useOrbitalStore.getState().setSearchQuery('');
      if (iss) useOrbitalStore.getState().select(iss.noradId);
      await wait(6500);
      if (!alive()) return;

      // 3 — fast-forward ×600
      set({ step: 2, caption: 2 });
      useClock.getState().setSpeed(600);
      await wait(9000);
      if (!alive()) return;

      // 4 — screening on a limited set
      set({ step: 3, caption: 3 });
      useClock.getState().setSpeed(60);
      ui.setLeftOpen(true);
      const s = useScreeningStore.getState();
      s.setMode('selected');
      s.setWindow(24);
      s.setThreshold(10);
      let events = iss ? await s.run() : [];
      if (!alive()) return;
      if (events.length === 0) events = await useScreeningStore.getState().runSimulated();
      if (!alive()) return;
      await wait(1500);
      if (!alive()) return;

      // 5 — open the first event: jump to TCA, distance plot, limitations
      set({ step: 4, caption: 4 });
      const first = events[0];
      if (first) useScreeningStore.getState().openEvent(first.id);
      ui.setRightTab('explain');
      await wait(5000);
      if (!alive()) return;
      useScreeningStore.getState().setLimitationsOpen(true);
      await wait(7000);
      if (!alive()) return;
      set({ caption: -1 });
      await wait(4000);
      if (!alive()) return;
      set({ running: false, caption: null });
    })();
  },

  stop: () => {
    token += 1;
    useScreeningStore.getState().cancel();
    set({ running: false, caption: null });
  },
}));

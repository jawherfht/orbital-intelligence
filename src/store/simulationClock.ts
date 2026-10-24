/**
 * Simulated clock, independent of wall-clock time (SPEC §6.3).
 *
 * The clock stores an anchor (simulated time at a given wall-clock instant)
 * and a speed. The current simulated time is derived on demand, so it never
 * drifts and can be read every frame without causing React re-renders.
 */
import { create } from 'zustand';

export interface ClockState {
  /** Simulated time (ms since epoch) at anchorWallMs. */
  anchorSimMs: number;
  /** Wall-clock time (ms since epoch) when the anchor was taken. */
  anchorWallMs: number;
  speed: number;
  paused: boolean;
  /** True when following real time at x1. */
  live: boolean;
  setSpeed: (speed: number) => void;
  setPaused: (paused: boolean) => void;
  goLive: () => void;
  setSimTime: (simMs: number) => void;
}

export function simTimeMs(state: Pick<ClockState, 'anchorSimMs' | 'anchorWallMs' | 'speed' | 'paused'>, wallMs = Date.now()): number {
  if (state.paused) return state.anchorSimMs;
  return state.anchorSimMs + (wallMs - state.anchorWallMs) * state.speed;
}

export const useClock = create<ClockState>((set, get) => {
  /** Re-anchor at the current simulated time before changing a parameter. */
  const reanchor = () => {
    const now = Date.now();
    return { anchorSimMs: simTimeMs(get(), now), anchorWallMs: now };
  };
  const start = Date.now();
  return {
    anchorSimMs: start,
    anchorWallMs: start,
    speed: 1,
    paused: false,
    live: true,
    setSpeed: (speed) => set({ ...reanchor(), speed, live: false }),
    setPaused: (paused) => set({ ...reanchor(), paused, live: false }),
    goLive: () => {
      const now = Date.now();
      set({ anchorSimMs: now, anchorWallMs: now, speed: 1, paused: false, live: true });
    },
    setSimTime: (simMs) => set({ anchorSimMs: simMs, anchorWallMs: Date.now(), live: false }),
  };
});

/** Current simulated Date — safe to call inside useFrame. */
export function getSimDate(): Date {
  return new Date(simTimeMs(useClock.getState()));
}

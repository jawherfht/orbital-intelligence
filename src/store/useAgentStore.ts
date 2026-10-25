/**
 * Decision agent state (DECISIONS D29): decisions per screened event, the
 * history from the server, and human approval / rejection.
 */
import { create } from 'zustand';
import { AGENT } from '../config';
import type { AgentEventContext, DecisionRecord } from '../types/agent';
import type { CloseApproachEvent } from '../screening/closeApproach';
import { fetchDecisions, requestDecision, resolveDecision } from '../data/agentClient';
import { fetchStatus } from '../data/sourcesClient';
import type { SourceStatus } from '../types/sources';
import { useOrbitalStore } from './useOrbitalStore';
import { getSimDate } from './simulationClock';
import { stateAt } from '../orbital/propagate';

interface AgentState {
  decisions: DecisionRecord[];
  /** Event ids being analysed. */
  analysing: Set<string>;
  errors: Record<string, string>;
  historyError: string | null;
  /** Agent window (top-bar button). */
  open: boolean;
  /** LLM configuration reported by the server, or null if the server is unreachable. */
  status: SourceStatus['agent'] | null;
  setOpen: (v: boolean) => void;
  loadStatus: () => Promise<void>;
  analyse: (ev: CloseApproachEvent, thresholdKm: number) => Promise<DecisionRecord | null>;
  /** Closest events first, at most AGENT.autoAnalyzeTop (called after each screening run). */
  autoAnalyse: (events: CloseApproachEvent[], thresholdKm: number) => Promise<void>;
  refresh: () => Promise<void>;
  resolve: (id: string, outcome: 'approve' | 'reject', comment: string) => Promise<void>;
}

/** Builds the computed facts sent to the agent; nothing is guessed. */
export function eventContext(ev: CloseApproachEvent, thresholdKm: number): AgentEventContext {
  const { byId } = useOrbitalStore.getState();
  const now = getSimDate();
  const side = (id: number, name: string, ageDays: number) => {
    const rec = byId.get(id);
    const st = rec ? stateAt(rec.satrec, new Date(ev.tcaMs)) : null;
    return { noradId: id, name, category: rec?.category ?? 'unknown', altitudeKm: st ? Number(st.altKm.toFixed(1)) : null, dataAgeDays: ageDays };
  };
  return {
    eventId: ev.id,
    primary: side(ev.primaryId, ev.primaryName, ev.primaryAgeDays),
    secondary: side(ev.secondaryId, ev.secondaryName, ev.secondaryAgeDays),
    tcaMs: ev.tcaMs,
    minDistanceKm: ev.minDistanceKm,
    relSpeedKmS: ev.relSpeedKmS,
    thresholdKm,
    nowMs: now.getTime(),
    simulated: ev.simulated,
  };
}

function upsert(list: DecisionRecord[], rec: DecisionRecord): DecisionRecord[] {
  return [rec, ...list.filter((d) => d.id !== rec.id)].sort((a, b) => b.createdAt - a.createdAt);
}

export const useAgentStore = create<AgentState>((set, get) => ({
  decisions: [],
  analysing: new Set(),
  errors: {},
  historyError: null,
  open: false,
  status: null,

  setOpen: (open) => {
    set({ open });
    if (open) {
      void get().loadStatus();
      void get().refresh();
    }
  },

  loadStatus: async () => {
    try {
      set({ status: (await fetchStatus()).agent ?? null });
    } catch {
      set({ status: null });
    }
  },

  analyse: async (ev, thresholdKm) => {
    if (get().analysing.has(ev.id)) return null;
    set((s) => ({ analysing: new Set(s.analysing).add(ev.id), errors: { ...s.errors, [ev.id]: '' } }));
    try {
      const { decision } = await requestDecision(eventContext(ev, thresholdKm));
      set((s) => ({ decisions: upsert(s.decisions, decision) }));
      return decision;
    } catch (e) {
      set((s) => ({ errors: { ...s.errors, [ev.id]: (e as Error).message } }));
      return null;
    } finally {
      set((s) => {
        const a = new Set(s.analysing);
        a.delete(ev.id);
        return { analysing: a };
      });
    }
  },

  autoAnalyse: async (events, thresholdKm) => {
    const top = [...events].sort((a, b) => a.minDistanceKm - b.minDistanceKm).slice(0, AGENT.autoAnalyzeTop);
    let made = 0;
    for (const ev of top) if (await get().analyse(ev, thresholdKm)) made += 1;
    // Show the agent window as soon as it has something to decide or report.
    if (made > 0) get().setOpen(true);
  },

  refresh: async () => {
    try {
      const { decisions } = await fetchDecisions();
      set({ decisions, historyError: null });
    } catch (e) {
      set({ historyError: (e as Error).message });
    }
  },

  resolve: async (id, outcome, comment) => {
    try {
      const { decision } = await resolveDecision(id, outcome, comment);
      set((s) => ({ decisions: upsert(s.decisions, decision), historyError: null }));
    } catch (e) {
      set({ historyError: (e as Error).message });
    }
  },
}));

/** Latest decision for one event, if any. */
export function decisionFor(decisions: DecisionRecord[], eventId: string): DecisionRecord | undefined {
  return decisions.find((d) => d.event.eventId === eventId);
}

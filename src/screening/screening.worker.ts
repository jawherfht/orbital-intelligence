/**
 * Screening off the main thread (SPEC §8.2). Cancel = terminate the worker.
 */
/// <reference lib="webworker" />
import { ommToRecord } from '../data/catalog';
import type { OmmRecord } from '../types/orbital';
import {
  pairsAllVsAll,
  pairsPrimaryVsOthers,
  screenPairs,
  type CloseApproachEvent,
  type ScreeningObject,
  type ScreeningParams,
  type ScreeningStats,
} from './closeApproach';

export interface ScreeningRequest {
  omm: OmmRecord[];
  simulatedIds: number[];
  /** Index of the primary object in `omm`, or null for "all vs all". */
  primaryIndex: number | null;
  maxOthers: number;
  params: ScreeningParams;
}

export type ScreeningMessage =
  | { type: 'progress'; fraction: number }
  | { type: 'done'; events: CloseApproachEvent[]; stats: ScreeningStats; capped: boolean }
  | { type: 'error'; message: string };

const post = (m: ScreeningMessage) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m);

function elementsKey(o: OmmRecord): string {
  return [o.EPOCH, o.MEAN_MOTION, o.ECCENTRICITY, o.INCLINATION, o.RA_OF_ASC_NODE, o.ARG_OF_PERICENTER, o.MEAN_ANOMALY].join('|');
}

self.onmessage = (e: MessageEvent<ScreeningRequest>) => {
  const t0 = performance.now();
  try {
    const { omm, simulatedIds, primaryIndex, maxOthers, params } = e.data;
    const sim = new Set(simulatedIds);
    const objects: ScreeningObject[] = [];
    let primary: number | null = null;
    omm.forEach((o, i) => {
      const r = ommToRecord(o, '');
      if (!r) return;
      if (i === primaryIndex) primary = objects.length;
      objects.push({
        id: r.noradId,
        name: r.name,
        satrec: r.satrec,
        epochMs: r.epoch.getTime(),
        meanMotionRevPerDay: r.meanMotionRevPerDay,
        eccentricity: r.eccentricity,
        elementsKey: elementsKey(o),
        simulated: sim.has(r.noradId),
      });
    });
    let pairs;
    let pairsTotal;
    let colocated;
    let capped = false;
    if (primaryIndex !== null) {
      if (primary === null) throw new Error('Primary object cannot be propagated');
      const res = pairsPrimaryVsOthers(objects, primary, params.marginKm, maxOthers);
      ({ pairs, pairsTotal, colocated, capped } = res);
    } else {
      ({ pairs, pairsTotal, colocated } = pairsAllVsAll(objects, params.marginKm));
    }
    let lastPost = 0;
    const events = screenPairs(objects, pairs, params, (f) => {
      const now = performance.now();
      if (now - lastPost > 100) {
        lastPost = now;
        post({ type: 'progress', fraction: f });
      }
    });
    post({
      type: 'done',
      events,
      capped,
      stats: {
        objects: objects.length,
        pairsTotal,
        pairsAfterPrefilter: pairs.length,
        colocatedExcluded: colocated,
        durationMs: performance.now() - t0,
      },
    });
  } catch (err) {
    post({ type: 'error', message: (err as Error).message });
  }
};

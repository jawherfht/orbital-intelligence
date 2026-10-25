/**
 * Mass propagation off the main thread (SPEC §6.2).
 * init: builds satrecs once; step: propagates every object at one instant and
 * returns ECI positions (km) and velocities (km/s) as transferable buffers.
 */
/// <reference lib="webworker" />
import { json2satrec, propagate, type OMMJsonObject, type SatRec } from 'satellite.js';
import type { OmmRecord } from '../types/orbital';

export type PropagationRequest = { type: 'init'; omm: OmmRecord[]; version: number } | { type: 'step'; timeMs: number; version: number };

export interface PropagationResult {
  type: 'step';
  version: number;
  timeMs: number;
  pos: Float64Array;
  vel: Float64Array;
  valid: Uint8Array;
}

let satrecs: (SatRec | null)[] = [];
let currentVersion = -1;

function build(o: OmmRecord): SatRec | null {
  try {
    // OmmRecord is the CelesTrak subset of OMMJsonObject; the cast only widens the type.
    return json2satrec(o as unknown as OMMJsonObject);
  } catch {
    return null;
  }
}

self.onmessage = (e: MessageEvent<PropagationRequest>) => {
  const msg = e.data;
  if (msg.type === 'init') {
    satrecs = msg.omm.map(build);
    currentVersion = msg.version;
    return;
  }
  if (msg.version !== currentVersion) return;
  const n = satrecs.length;
  const pos = new Float64Array(n * 3);
  const vel = new Float64Array(n * 3);
  const valid = new Uint8Array(n);
  const date = new Date(msg.timeMs);
  for (let i = 0; i < n; i++) {
    const s = satrecs[i];
    if (!s) continue;
    let pv;
    try {
      pv = propagate(s, date);
    } catch {
      pv = null;
    }
    if (!pv || s.error !== 0 || !Number.isFinite(pv.position.x)) continue;
    pos[i * 3] = pv.position.x;
    pos[i * 3 + 1] = pv.position.y;
    pos[i * 3 + 2] = pv.position.z;
    vel[i * 3] = pv.velocity.x;
    vel[i * 3 + 1] = pv.velocity.y;
    vel[i * 3 + 2] = pv.velocity.z;
    valid[i] = 1;
  }
  const result: PropagationResult = { type: 'step', version: msg.version, timeMs: msg.timeMs, pos, vel, valid };
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(result, [pos.buffer, vel.buffer, valid.buffer]);
};

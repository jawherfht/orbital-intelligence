/**
 * Shared, frame-rate state of the satellite swarm (no React state).
 *
 * The worker propagates every object at a few Hz (RENDER.propagationHz);
 * each frame positions are Hermite-interpolated between the two samples
 * that bracket the simulated time. When no bracket exists (start, time jump,
 * slider), one synchronous propagation on the main thread fills the gap.
 */
import type { SatRec } from 'satellite.js';
import { EARTH_RADIUS_KM, RENDER } from '../config';
import type { SatelliteRecord } from '../types/orbital';
import { propagateEci } from '../orbital/propagate';
import { hermiteInto } from '../orbital/interpolate';
import type { PropagationRequest, PropagationResult } from '../orbital/propagation.worker';
import PropagationWorker from '../orbital/propagation.worker.ts?worker';

interface Sample {
  timeMs: number;
  pos: Float64Array;
  vel: Float64Array;
  valid: Uint8Array;
}

class SwarmEngine {
  ids: number[] = [];
  indexById = new Map<number, number>();
  satrecs: SatRec[] = [];
  /** Interpolated ECI positions, km (index i*3). */
  eciKm = new Float64Array(0);
  /** Scene positions in Earth radii (index i*3). */
  scene = new Float32Array(0);
  /** 1 when the object has a valid position this frame. */
  valid = new Uint8Array(0);
  /** Last measured interpolation error for the debug overlay, km. */
  interpErrorKm = 0;
  /** Bumped on every init, so consumers can rebuild buffers. */
  version = 0;

  private samples: Sample[] = [];
  private worker: Worker | null = null;
  private pending = false;
  private lastErrorCheck = 0;

  init(records: SatelliteRecord[]) {
    this.version += 1;
    this.ids = records.map((r) => r.noradId);
    this.indexById = new Map(this.ids.map((id, i) => [id, i]));
    this.satrecs = records.map((r) => r.satrec);
    const n = records.length;
    this.eciKm = new Float64Array(n * 3);
    this.scene = new Float32Array(n * 3);
    this.valid = new Uint8Array(n);
    this.samples = [];
    this.pending = false;
    if (!this.worker && typeof Worker !== 'undefined') {
      try {
        this.worker = new PropagationWorker();
        this.worker.onmessage = (e: MessageEvent<PropagationResult>) => this.onSample(e.data);
      } catch {
        this.worker = null; // main-thread fallback only
      }
    }
    this.post({ type: 'init', omm: records.map((r) => r.omm), version: this.version });
  }

  private post(msg: PropagationRequest) {
    this.worker?.postMessage(msg);
  }

  private onSample(r: PropagationResult) {
    this.pending = false;
    if (r.version !== this.version) return;
    this.samples.push({ timeMs: r.timeMs, pos: r.pos, vel: r.vel, valid: r.valid });
    this.samples.sort((a, b) => a.timeMs - b.timeMs);
  }

  private syncSample(timeMs: number): Sample {
    const n = this.satrecs.length;
    const pos = new Float64Array(n * 3);
    const vel = new Float64Array(n * 3);
    const valid = new Uint8Array(n);
    const date = new Date(timeMs);
    for (let i = 0; i < n; i++) {
      const s = propagateEci(this.satrecs[i]!, date);
      if (!s) continue;
      pos.set(s.r, i * 3);
      vel.set(s.v, i * 3);
      valid[i] = 1;
    }
    return { timeMs, pos, vel, valid };
  }

  /** Called once per frame with the current simulated time. */
  update(tMs: number, speed: number, paused: boolean) {
    const n = this.satrecs.length;
    if (n === 0) return;
    const stepMs = Math.max(250, (speed * 1000) / RENDER.propagationHz);

    let a: Sample | undefined;
    let b: Sample | undefined;
    for (let k = 0; k < this.samples.length; k++) {
      const s = this.samples[k]!;
      if (s.timeMs <= tMs) a = s;
      if (s.timeMs >= tMs) {
        b = s;
        break;
      }
    }
    if (!a || !b || b.timeMs - a.timeMs > stepMs * 4) {
      const s = this.syncSample(tMs);
      this.samples = [s];
      a = s;
      b = s;
    }

    // Keep one sample before t, drop older ones.
    const firstNeeded = this.samples.indexOf(a);
    if (firstNeeded > 0) this.samples.splice(0, firstNeeded);

    // Ask the worker for the next sample ahead of time.
    const last = this.samples[this.samples.length - 1]!;
    if (!paused && this.worker && !this.pending && last.timeMs < tMs + 2 * stepMs) {
      this.pending = true;
      this.post({ type: 'step', timeMs: Math.max(last.timeMs, tMs) + stepMs, version: this.version });
    }

    const R = EARTH_RADIUS_KM;
    for (let i = 0; i < n; i++) {
      const ok = a.valid[i] === 1 && b.valid[i] === 1;
      this.valid[i] = ok ? 1 : 0;
      if (!ok) continue;
      if (a === b) {
        this.eciKm[i * 3] = a.pos[i * 3]!;
        this.eciKm[i * 3 + 1] = a.pos[i * 3 + 1]!;
        this.eciKm[i * 3 + 2] = a.pos[i * 3 + 2]!;
      } else {
        hermiteInto(this.eciKm, i * 3, a.pos, a.vel, b.pos, b.vel, i, a.timeMs, b.timeMs, tMs);
      }
      const x = this.eciKm[i * 3]!;
      const y = this.eciKm[i * 3 + 1]!;
      const z = this.eciKm[i * 3 + 2]!;
      this.scene[i * 3] = x / R;
      this.scene[i * 3 + 1] = z / R;
      this.scene[i * 3 + 2] = -y / R;
    }

    // Measure the interpolation error on one object twice per second (DECISIONS D11).
    const now = performance.now();
    if (now - this.lastErrorCheck > 500 && a !== b) {
      this.lastErrorCheck = now;
      const i = this.valid.indexOf(1);
      if (i >= 0) {
        const exact = propagateEci(this.satrecs[i]!, new Date(tMs));
        if (exact) {
          this.interpErrorKm = Math.hypot(
            exact.r[0] - this.eciKm[i * 3]!,
            exact.r[1] - this.eciKm[i * 3 + 1]!,
            exact.r[2] - this.eciKm[i * 3 + 2]!,
          );
        }
      }
    }
  }

  /** Scene position of one object this frame, or null. */
  scenePosition(id: number): [number, number, number] | null {
    const i = this.indexById.get(id);
    if (i === undefined || this.valid[i] !== 1) return null;
    return [this.scene[i * 3]!, this.scene[i * 3 + 1]!, this.scene[i * 3 + 2]!];
  }
}

export const swarm = new SwarmEngine();

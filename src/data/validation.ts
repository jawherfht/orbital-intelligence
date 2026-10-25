/**
 * Validation & freshness checks applied to every element set, whatever its
 * source (CelesTrak, Space-Track, mirror), before SGP4 (DECISIONS D28).
 *
 * No runtime imports: the Node server and the snapshot script load this file directly.
 */
import type { OmmRecord } from '../types/orbital';

export type Freshness = 'fresh' | 'aging' | 'stale' | 'future';

export interface ValidationResult {
  ok: boolean;
  /** Human-readable reasons when !ok. */
  errors: string[];
}

/** Coerces a Space-Track (strings) or CelesTrak (numbers) OMM to numeric fields. */
export function normalizeOmm(raw: Record<string, unknown>): OmmRecord {
  const num = (k: string, fallback = 0) => {
    const v = raw[k];
    if (v === null || v === undefined || v === '') return fallback;
    return Number(v);
  };
  return {
    OBJECT_NAME: String(raw.OBJECT_NAME ?? '').trim(),
    OBJECT_ID: String(raw.OBJECT_ID ?? '').trim(),
    EPOCH: String(raw.EPOCH ?? ''),
    MEAN_MOTION: num('MEAN_MOTION', Number.NaN),
    ECCENTRICITY: num('ECCENTRICITY', Number.NaN),
    INCLINATION: num('INCLINATION', Number.NaN),
    RA_OF_ASC_NODE: num('RA_OF_ASC_NODE', Number.NaN),
    ARG_OF_PERICENTER: num('ARG_OF_PERICENTER', Number.NaN),
    MEAN_ANOMALY: num('MEAN_ANOMALY', Number.NaN),
    EPHEMERIS_TYPE: num('EPHEMERIS_TYPE'),
    CLASSIFICATION_TYPE: String(raw.CLASSIFICATION_TYPE ?? 'U'),
    NORAD_CAT_ID: num('NORAD_CAT_ID', Number.NaN),
    ELEMENT_SET_NO: num('ELEMENT_SET_NO'),
    REV_AT_EPOCH: num('REV_AT_EPOCH'),
    BSTAR: num('BSTAR'),
    MEAN_MOTION_DOT: num('MEAN_MOTION_DOT'),
    MEAN_MOTION_DDOT: num('MEAN_MOTION_DDOT'),
  };
}

export function epochMs(epoch: string): number {
  return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(epoch) ? epoch : `${epoch}Z`);
}

/** Physical and format sanity of one OMM element set. */
export function validateOmm(o: OmmRecord, nowMs = Date.now()): ValidationResult {
  const errors: string[] = [];
  const finite = (k: keyof OmmRecord) => {
    if (!Number.isFinite(o[k] as number)) errors.push(`${String(k)} is not a number`);
  };
  (['MEAN_MOTION', 'ECCENTRICITY', 'INCLINATION', 'RA_OF_ASC_NODE', 'ARG_OF_PERICENTER', 'MEAN_ANOMALY', 'NORAD_CAT_ID', 'BSTAR'] as const).forEach(finite);
  if (!(o.NORAD_CAT_ID > 0)) errors.push('NORAD_CAT_ID must be positive');
  if (!o.OBJECT_NAME) errors.push('OBJECT_NAME is empty');
  if (!(o.ECCENTRICITY >= 0 && o.ECCENTRICITY < 1)) errors.push('ECCENTRICITY out of [0, 1)');
  if (!(o.INCLINATION >= 0 && o.INCLINATION <= 180)) errors.push('INCLINATION out of [0, 180]');
  // Below ~0.05 rev/day the object is beyond lunar distance; above ~17 rev/day it would be underground.
  if (!(o.MEAN_MOTION > 0.05 && o.MEAN_MOTION < 17.5)) errors.push('MEAN_MOTION out of (0.05, 17.5) rev/day');
  if (o.EPHEMERIS_TYPE !== 0) errors.push('EPHEMERIS_TYPE is not 0 (SGP4)');
  const t = epochMs(o.EPOCH);
  if (!Number.isFinite(t)) errors.push('EPOCH is not a valid date');
  else if (t > nowMs + 86_400_000) errors.push('EPOCH is more than 1 day in the future');
  return { ok: errors.length === 0, errors };
}

/** Freshness of an element set relative to `atMs` (default: now). */
export function freshness(epoch: string, atMs = Date.now()): { ageDays: number; level: Freshness } {
  const ageDays = (atMs - epochMs(epoch)) / 86_400_000;
  if (ageDays < -1 / 24) return { ageDays, level: 'future' };
  if (ageDays < 3) return { ageDays, level: 'fresh' };
  if (ageDays <= 7) return { ageDays, level: 'aging' };
  return { ageDays, level: 'stale' };
}

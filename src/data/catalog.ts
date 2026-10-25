/**
 * OMM JSON → SatelliteRecord, category inference (DECISIONS D12),
 * de-duplication and SGP4 sanity check (SPEC M2).
 */
import { json2satrec, type OMMJsonObject } from 'satellite.js';
import type { OmmRecord, SatelliteCategory, SatelliteRecord } from '../types/orbital';
import { isPropagatable } from '../orbital/propagate';

const STATION_NAMES = /\b(ISS|ZARYA|TIANGONG|TIANHE|CSS|WENTIAN|MENGTIAN)\b/i;

/**
 * Category is inferred: CelesTrak GP data carries no object type.
 * Debris and rocket bodies follow the catalogue naming convention (" DEB", "R/B").
 */
export function inferCategory(name: string, group: string): SatelliteCategory {
  const n = name.toUpperCase();
  if (/\bDEB\b|DEBRIS/.test(n)) return 'debris';
  if (/R\/B|ROCKET BODY|\bAKM\b|\bPKM\b/.test(n)) return 'rocket_body';
  if (group === 'stations' && STATION_NAMES.test(n)) return 'station';
  if (/^OBJECT [A-Z]+$|^TBA\b|UNKNOWN/.test(n)) return 'unknown';
  return 'payload';
}

/** CelesTrak EPOCH has no time-zone suffix but is UTC. */
export function parseEpoch(epoch: string): Date {
  return new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(epoch) ? epoch : `${epoch}Z`);
}

export function ommToRecord(omm: OmmRecord, group: string): SatelliteRecord | null {
  try {
    // OmmRecord is a CelesTrak-shaped subset of OMMJsonObject; the cast only widens the type.
    const satrec = json2satrec(omm as unknown as OMMJsonObject);
    if (satrec.error !== 0) return null;
    return {
      noradId: Number(omm.NORAD_CAT_ID),
      name: omm.OBJECT_NAME.trim(),
      intlDesignator: omm.OBJECT_ID || undefined,
      epoch: parseEpoch(omm.EPOCH),
      inclinationDeg: Number(omm.INCLINATION),
      eccentricity: Number(omm.ECCENTRICITY),
      meanMotionRevPerDay: Number(omm.MEAN_MOTION),
      raanDeg: Number(omm.RA_OF_ASC_NODE),
      argPerigeeDeg: Number(omm.ARG_OF_PERICENTER),
      meanAnomalyDeg: Number(omm.MEAN_ANOMALY),
      bstar: Number(omm.BSTAR),
      group,
      category: inferCategory(omm.OBJECT_NAME, group),
      satrec,
      omm,
    };
  } catch {
    return null;
  }
}

export interface CatalogBuildResult {
  records: SatelliteRecord[];
  /** Objects whose element set could not be propagated (decayed, invalid). */
  skipped: number;
  /** Objects present in several groups, kept once. */
  duplicates: number;
}

/**
 * Builds the catalog from several groups. The first group wins for
 * duplicated NORAD ids. Every record is test-propagated at `checkAt`;
 * failures are skipped and counted.
 */
export function buildCatalog(groups: { group: string; omm: OmmRecord[] }[], checkAt: Date, limit = Infinity): CatalogBuildResult {
  const seen = new Set<number>();
  const records: SatelliteRecord[] = [];
  let skipped = 0;
  let duplicates = 0;
  for (const { group, omm } of groups) {
    for (const o of omm) {
      const id = Number(o.NORAD_CAT_ID);
      if (seen.has(id)) {
        duplicates += 1;
        continue;
      }
      const rec = ommToRecord(o, group);
      if (!rec || !isPropagatable(rec.satrec, checkAt)) {
        skipped += 1;
        continue;
      }
      if (records.length >= limit) continue;
      seen.add(id);
      records.push(rec);
    }
  }
  return { records, skipped, duplicates };
}

/** Case-insensitive partial name match, or exact NORAD id (SPEC M4). */
export function searchCatalog(records: SatelliteRecord[], query: string, max = 50): SatelliteRecord[] {
  const q = query.trim();
  if (!q) return [];
  if (/^\d+$/.test(q)) {
    const id = Number(q);
    const exact = records.filter((r) => r.noradId === id);
    if (exact.length) return exact;
  }
  const lower = q.toLowerCase();
  const starts: SatelliteRecord[] = [];
  const contains: SatelliteRecord[] = [];
  for (const r of records) {
    const n = r.name.toLowerCase();
    if (n.startsWith(lower)) starts.push(r);
    else if (n.includes(lower)) contains.push(r);
  }
  return [...starts, ...contains].slice(0, max);
}

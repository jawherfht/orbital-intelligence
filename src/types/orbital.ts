/**
 * Internal data model (SPEC §4.4).
 */
import type { SatRec } from 'satellite.js';

/**
 * One CelesTrak OMM JSON record, as returned by
 * gp.php?...&FORMAT=JSON (numbers, not strings). Only the fields the module
 * reads are listed; CelesTrak may add more.
 */
export interface OmmRecord {
  OBJECT_NAME: string;
  OBJECT_ID: string;
  EPOCH: string;
  MEAN_MOTION: number;
  ECCENTRICITY: number;
  INCLINATION: number;
  RA_OF_ASC_NODE: number;
  ARG_OF_PERICENTER: number;
  MEAN_ANOMALY: number;
  EPHEMERIS_TYPE: number;
  CLASSIFICATION_TYPE: string;
  NORAD_CAT_ID: number;
  ELEMENT_SET_NO: number;
  REV_AT_EPOCH: number;
  BSTAR: number;
  MEAN_MOTION_DOT: number;
  MEAN_MOTION_DDOT: number;
}

export type SatelliteCategory = 'station' | 'payload' | 'debris' | 'rocket_body' | 'unknown';

export const CATEGORIES: readonly SatelliteCategory[] = ['station', 'payload', 'rocket_body', 'debris', 'unknown'];

export interface SatelliteRecord {
  noradId: number;
  name: string;
  /** OBJECT_ID (international designator, e.g. 1998-067A). */
  intlDesignator?: string;
  /** EPOCH of the OMM. */
  epoch: Date;
  inclinationDeg: number;
  eccentricity: number;
  meanMotionRevPerDay: number;
  raanDeg: number;
  argPerigeeDeg: number;
  meanAnomalyDeg: number;
  bstar: number;
  /** CelesTrak group the record was loaded from (first group wins when duplicated). */
  group: string;
  /** Inferred from the name and group (DECISIONS D12). */
  category: SatelliteCategory;
  satrec: SatRec;
  /** Original OMM, kept so the record can be sent to a Web Worker. */
  omm: OmmRecord;
  /** True for synthetic objects of the simulated test scenario (DECISIONS D9). */
  simulated?: boolean;
}

export interface StateVector {
  time: Date;
  positionEciKm: [number, number, number];
  velocityEciKmS: [number, number, number];
  latDeg: number;
  lonDeg: number;
  altKm: number;
  speedKmS: number;
}

export type OrbitClass = 'LEO' | 'MEO' | 'GEO' | 'HEO';

export interface DerivedElements {
  periodMin: number;
  semiMajorAxisKm: number;
  apogeeKm: number;
  perigeeKm: number;
  orbitClass: OrbitClass;
}

/** Where the loaded catalog came from (SPEC §4.3 indicator). */
export type DataSourceKind = 'snapshot' | 'live' | 'live-mirror' | 'cache';

export interface DataSourceInfo {
  kind: DataSourceKind;
  /** ISO time the data was downloaded from its origin. */
  fetchedAt: string;
  /** Human-readable origin (CelesTrak, or the GitHub mirror of CelesTrak). */
  origin: string;
}

/** public/data/manifest.json */
export interface SnapshotManifest {
  generatedAt: string;
  groups: SnapshotGroupInfo[];
}

export interface SnapshotGroupInfo {
  group: string;
  file: string;
  count: number;
  /** Number of objects in the upstream group before sampling. */
  upstreamCount: number;
  /** URL the data was downloaded from. */
  source: string;
  /** "celestrak-omm" (OMM JSON from CelesTrak) or "mirror-tle" (TLE from the GitHub mirror, converted to OMM). */
  format: 'celestrak-omm' | 'mirror-tle';
  /** Freshness of the upstream file when known (mirror LAST_REFRESH). */
  upstreamRefreshedAt?: string;
}

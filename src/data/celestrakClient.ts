/**
 * Data access (SPEC §4.3):
 *   1. local snapshot (public/data) — immediate, works offline;
 *   2. "Refresh from CelesTrak": live download, cached 2 h in IndexedDB.
 *      Order tried: CelesTrak directly → Vite dev proxy (dev only) → GitHub mirror of CelesTrak (DECISIONS D20).
 * IndexedDB is optional: every access is wrapped in try/catch (DECISIONS D13).
 */
import { DATA, SNAPSHOT_GROUPS, SOURCES } from '../config';
import type { DataSourceInfo, OmmRecord, SnapshotManifest } from '../types/orbital';
import { parseTleFile } from './tle';
import { sampleGroup } from './sample';

export interface GroupData {
  group: string;
  omm: OmmRecord[];
}

export interface LoadResult {
  groups: GroupData[];
  source: DataSourceInfo;
  /** Groups that could not be loaded, with the reason. */
  failures: string[];
}

const BASE = import.meta.env.BASE_URL;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return (await res.json()) as T;
}

async function getText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ---------------------------------------------------------------- snapshot

export async function loadManifest(): Promise<SnapshotManifest> {
  return getJson<SnapshotManifest>(`${BASE}${DATA.snapshotPath}/manifest.json`);
}

export async function loadSnapshot(groups?: string[]): Promise<LoadResult & { manifest: SnapshotManifest }> {
  const manifest = await loadManifest();
  const wanted = manifest.groups.filter((g) => !groups || groups.includes(g.group));
  const failures: string[] = [];
  const loaded = await Promise.all(
    wanted.map(async (g) => {
      try {
        return { group: g.group, omm: await getJson<OmmRecord[]>(`${BASE}${DATA.snapshotPath}/${g.file}`) };
      } catch (e) {
        failures.push(`${g.group}: ${(e as Error).message}`);
        return null;
      }
    }),
  );
  const viaMirror = wanted.some((g) => g.format === 'mirror-tle');
  return {
    manifest,
    groups: loaded.filter((g): g is GroupData => g !== null),
    failures,
    source: {
      kind: 'snapshot',
      fetchedAt: manifest.generatedAt,
      origin: viaMirror ? 'CelesTrak (via GitHub mirror)' : 'CelesTrak',
    },
  };
}

// ---------------------------------------------------------------- IndexedDB cache

interface CacheEntry {
  group: string;
  fetchedAt: number;
  origin: string;
  omm: OmmRecord[];
}

const DB_NAME = 'orbital-intelligence';
const STORE = 'gp-cache';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'group' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function cacheGet(group: string): Promise<CacheEntry | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(group);
      req.onsuccess = () => resolve((req.result as CacheEntry | undefined) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function cachePut(entry: CacheEntry): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Cache is optional (private mode, blocked storage…).
  }
}

// ---------------------------------------------------------------- live

async function fetchGroupLive(group: string): Promise<{ omm: OmmRecord[]; origin: string }> {
  const errors: string[] = [];
  const direct = SOURCES.celestrakGroup(group);
  const candidates = [direct];
  if (import.meta.env.DEV) candidates.push(direct.replace('https://celestrak.org', DATA.celestrakDevProxy));
  for (const url of candidates) {
    try {
      const json = await getJson<unknown>(url);
      if (Array.isArray(json) && json.length > 0) return { omm: json as OmmRecord[], origin: 'CelesTrak' };
      errors.push(`${url}: empty or invalid payload`);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  const file = SOURCES.mirrorFiles[group];
  if (file) {
    try {
      const { records } = parseTleFile(await getText(`${SOURCES.mirrorRaw}/${file}`));
      if (records.length) return { omm: records, origin: 'CelesTrak (via GitHub mirror)' };
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  throw new Error(errors.join('; ') || 'no source available');
}

/**
 * Live refresh of the given groups. A group cached less than 2 hours ago is
 * served from the cache, never downloaded again (CelesTrak usage rules).
 */
export async function loadLive(groups: string[]): Promise<LoadResult> {
  const failures: string[] = [];
  const out: GroupData[] = [];
  let oldestFetch = Infinity;
  let anyNetwork = false;
  const origins = new Set<string>();
  for (const group of groups) {
    const cached = await cacheGet(group);
    if (cached && Date.now() - cached.fetchedAt < DATA.liveCacheMaxAgeMs) {
      out.push({ group, omm: cached.omm });
      oldestFetch = Math.min(oldestFetch, cached.fetchedAt);
      origins.add(cached.origin);
      continue;
    }
    try {
      const { omm, origin } = await fetchGroupLive(group);
      const max = SNAPSHOT_GROUPS.find((g) => g.group === group)?.sample;
      const kept = sampleGroup(omm, max);
      const fetchedAt = Date.now();
      await cachePut({ group, fetchedAt, origin, omm: kept });
      out.push({ group, omm: kept });
      oldestFetch = Math.min(oldestFetch, fetchedAt);
      origins.add(origin);
      anyNetwork = true;
    } catch (e) {
      failures.push(`${group}: ${(e as Error).message}`);
    }
  }
  const viaMirror = [...origins].some((o) => o.includes('mirror'));
  return {
    groups: out,
    failures,
    source: {
      kind: anyNetwork ? (viaMirror ? 'live-mirror' : 'live') : 'cache',
      fetchedAt: new Date(Number.isFinite(oldestFetch) ? oldestFetch : Date.now()).toISOString(),
      origin: viaMirror ? 'CelesTrak (via GitHub mirror)' : 'CelesTrak',
    },
  };
}

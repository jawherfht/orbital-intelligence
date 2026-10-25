/**
 * npm run data:update — downloads the snapshot groups into public/data/ (SPEC §4.3).
 *
 *   1. CelesTrak OMM JSON  (https://celestrak.org/NORAD/elements/gp.php?GROUP=<g>&FORMAT=JSON)
 *   2. if CelesTrak is unreachable: the public GitHub mirror of CelesTrak
 *      (TLE format, converted exactly to OMM — DECISIONS D20).
 *
 * Respects CelesTrak usage rules: a group downloaded less than 2 hours ago is
 * not downloaded again unless --force is passed.
 *
 * Runs with plain Node ≥ 22 (built-in TypeScript type stripping).
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DATA, SNAPSHOT_GROUPS, SOURCES } from '../src/config.ts';
import { parseTleFile } from '../src/data/tle.ts';
import { sampleGroup } from '../src/data/sample.ts';
import type { OmmRecord, SnapshotGroupInfo, SnapshotManifest } from '../src/types/orbital.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data');
const MANIFEST = join(OUT, 'manifest.json');
const FORCE = process.argv.includes('--force');
const USER_AGENT = 'orbital-intelligence/0.1 (hackathon prototype; snapshot script, run manually)';

async function get(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fromCelestrak(group: string): Promise<{ omm: OmmRecord[]; source: string }> {
  const url = SOURCES.celestrakGroup(group);
  const text = await get(url);
  const json: unknown = JSON.parse(text);
  if (!Array.isArray(json) || json.length === 0) throw new Error(`unexpected payload: ${text.slice(0, 80)}`);
  return { omm: json as OmmRecord[], source: url };
}

async function fromMirror(group: string): Promise<{ omm: OmmRecord[]; source: string; refreshedAt?: string }> {
  const file = SOURCES.mirrorFiles[group];
  if (!file) throw new Error('group not available in the mirror');
  const url = `${SOURCES.mirrorRaw}/${file}`;
  const { records, skipped } = parseTleFile(await get(url));
  if (records.length === 0) throw new Error('empty file');
  if (skipped) console.warn(`  ${group}: ${skipped} malformed TLE entries skipped`);
  // The mirror writes LAST_REFRESH (30-min groups) and LAST_REFRESH_ACTIVE (amateur, active).
  const stampFile = file.endsWith('.3le') ? 'LAST_REFRESH_ACTIVE' : 'LAST_REFRESH';
  const refreshedAt = (await get(`${SOURCES.mirrorRaw}/${stampFile}`).catch(() => '')).trim() || undefined;
  return { omm: records, source: url, refreshedAt };
}

function readManifest(): SnapshotManifest | null {
  if (!existsSync(MANIFEST)) return null;
  try {
    return JSON.parse(readFileSync(MANIFEST, 'utf8')) as SnapshotManifest;
  } catch {
    return null;
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const previous = readManifest();
  if (previous && !FORCE && Date.now() - Date.parse(previous.generatedAt) < DATA.liveCacheMaxAgeMs) {
    console.log(`Snapshots are less than 2 h old (${previous.generatedAt}). Use --force to download again.`);
    return;
  }

  const groups: SnapshotGroupInfo[] = [];
  for (const { group, sample: max } of SNAPSHOT_GROUPS) {
    let result: { omm: OmmRecord[]; source: string; refreshedAt?: string } | null = null;
    let format: SnapshotGroupInfo['format'] = 'celestrak-omm';
    try {
      result = await fromCelestrak(group);
    } catch (e) {
      console.warn(`  ${group}: CelesTrak unreachable (${(e as Error).message}), trying the GitHub mirror`);
      try {
        result = await fromMirror(group);
        format = 'mirror-tle';
      } catch (e2) {
        console.warn(`  ${group}: mirror failed too (${(e2 as Error).message}) — group skipped`);
      }
    }
    if (!result) {
      const old = previous?.groups.find((g) => g.group === group);
      if (old && existsSync(join(OUT, old.file))) {
        console.warn(`  ${group}: keeping the previous snapshot`);
        groups.push(old);
      }
      continue;
    }
    const kept = sampleGroup(result.omm, max);
    const file = `${group}.json`;
    writeFileSync(join(OUT, file), JSON.stringify(kept));
    groups.push({
      group,
      file,
      count: kept.length,
      upstreamCount: result.omm.length,
      source: result.source,
      format,
      ...(result.refreshedAt ? { upstreamRefreshedAt: result.refreshedAt } : {}),
    });
    console.log(`  ${group}: ${kept.length}/${result.omm.length} objects (${format})`);
    // Be gentle with the upstream server between groups.
    await new Promise((r) => setTimeout(r, 500));
  }

  const manifest: SnapshotManifest = { generatedAt: new Date().toISOString(), groups };
  writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
  const total = groups.reduce((s, g) => s + g.count, 0);
  console.log(`Wrote ${groups.length} groups, ${total} objects → public/data/manifest.json`);
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});

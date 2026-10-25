/**
 * Deterministic subset of a large group: every k-th object sorted by NORAD id.
 * Shared by the snapshot script and the live refresh so both keep the same objects.
 * No runtime imports: the Node snapshot script loads this file directly.
 */
import type { OmmRecord } from '../types/orbital';

export function sampleGroup(records: OmmRecord[], max: number | undefined): OmmRecord[] {
  if (!max || records.length <= max) return records;
  const sorted = [...records].sort((a, b) => a.NORAD_CAT_ID - b.NORAD_CAT_ID);
  const step = sorted.length / max;
  return Array.from({ length: max }, (_, i) => sorted[Math.floor(i * step)]!);
}

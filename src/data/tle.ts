/**
 * Exact TLE → OMM conversion (DECISIONS D20).
 *
 * Used only when CelesTrak's OMM JSON endpoint is unreachable and the data
 * comes from the GitHub mirror of CelesTrak, which publishes the same GP data
 * in TLE format. Every OMM field is a direct re-encoding of a TLE column, with
 * the same units and conventions that satellite.js `json2satrec` expects
 * (MEAN_MOTION_DOT and MEAN_MOTION_DDOT are the TLE values as printed).
 * A test checks that both paths give identical SGP4 positions.
 *
 * This file has no imports so that the Node snapshot script can load it directly.
 */
import type { OmmRecord } from '../types/orbital';

/** Decodes a TLE "implied decimal point" field such as " 14938-3" → 0.14938e-3. */
function impliedDecimal(field: string): number {
  const s = field.trim();
  if (s === '' || /^[-+]?0+[-+]0$/.test(s)) return 0;
  const m = /^([-+]?)(\d+)([-+]\d)$/.exec(s);
  if (!m) throw new Error(`Bad implied-decimal field "${field}"`);
  return Number(`${m[1]}0.${m[2]}e${m[3]}`);
}

/** Decodes a catalogue number, including the Alpha-5 scheme (A0001 = 100001). */
function catalogNumber(field: string): number {
  const s = field.trim();
  if (/^\d+$/.test(s)) return Number(s);
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // I and O are skipped by Alpha-5
  const idx = letters.indexOf(s.charAt(0));
  if (idx < 0) throw new Error(`Bad catalogue number "${field}"`);
  return (idx + 10) * 10000 + Number(s.slice(1));
}

function checksumOk(line: string): boolean {
  let sum = 0;
  for (const ch of line.slice(0, 68)) {
    if (ch >= '0' && ch <= '9') sum += Number(ch);
    else if (ch === '-') sum += 1;
  }
  return sum % 10 === Number(line.charAt(68));
}

/** TLE epoch (2-digit year + fractional day of year) → ISO string with microseconds, no "Z" (CelesTrak style). */
export function tleEpochToIso(yy: number, dayOfYear: number): string {
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  const totalUs = Math.round((dayOfYear - 1) * 86_400_000_000);
  const ms = Math.floor(totalUs / 1000);
  const us = totalUs - ms * 1000;
  const d = new Date(Date.UTC(year, 0, 1) + ms);
  const frac = String(d.getUTCMilliseconds() * 1000 + us).padStart(6, '0');
  return `${d.toISOString().slice(0, 19)}.${frac}`;
}

/** "98067A  " → "1998-067A". */
function intlDesignator(field: string): string {
  const s = field.trim();
  if (s.length < 5) return s;
  const yy = Number(s.slice(0, 2));
  const year = yy < 57 ? 2000 + yy : 1900 + yy;
  return `${year}-${s.slice(2)}`;
}

export function tleToOmm(name: string, line1: string, line2: string): OmmRecord {
  if (line1.charAt(0) !== '1' || line2.charAt(0) !== '2') throw new Error('Not a TLE line pair');
  if (line1.length < 69 || line2.length < 69) throw new Error('TLE line too short');
  if (!checksumOk(line1) || !checksumOk(line2)) throw new Error('TLE checksum mismatch');
  return {
    OBJECT_NAME: name.trim(),
    OBJECT_ID: intlDesignator(line1.slice(9, 17)),
    EPOCH: tleEpochToIso(Number(line1.slice(18, 20)), Number(line1.slice(20, 32))),
    MEAN_MOTION: Number(line2.slice(52, 63)),
    ECCENTRICITY: Number(`0.${line2.slice(26, 33).trim().replace(/\s/g, '0')}`),
    INCLINATION: Number(line2.slice(8, 16)),
    RA_OF_ASC_NODE: Number(line2.slice(17, 25)),
    ARG_OF_PERICENTER: Number(line2.slice(34, 42)),
    MEAN_ANOMALY: Number(line2.slice(43, 51)),
    EPHEMERIS_TYPE: Number(line1.charAt(62).trim() || '0'),
    CLASSIFICATION_TYPE: line1.charAt(7) || 'U',
    NORAD_CAT_ID: catalogNumber(line1.slice(2, 7)),
    ELEMENT_SET_NO: Number(line1.slice(64, 68).trim() || '0'),
    REV_AT_EPOCH: Number(line2.slice(63, 68).trim() || '0'),
    BSTAR: impliedDecimal(line1.slice(53, 61)),
    MEAN_MOTION_DOT: Number(line1.slice(33, 43)),
    MEAN_MOTION_DDOT: impliedDecimal(line1.slice(44, 52)),
  };
}

/**
 * Parses a 3-line (name + 2 lines) TLE file. Malformed entries are skipped
 * and counted rather than aborting the whole file.
 */
export function parseTleFile(text: string): { records: OmmRecord[]; skipped: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  const records: OmmRecord[] = [];
  let skipped = 0;
  for (let i = 0; i < lines.length; ) {
    const a = lines[i] ?? '';
    const b = lines[i + 1] ?? '';
    const c = lines[i + 2] ?? '';
    if (a.startsWith('1 ') && b.startsWith('2 ')) {
      // 2-line file without names.
      try {
        records.push(tleToOmm(`NORAD ${a.slice(2, 7).trim()}`, a, b));
      } catch {
        skipped += 1;
      }
      i += 2;
    } else if (b.startsWith('1 ') && c.startsWith('2 ')) {
      try {
        records.push(tleToOmm(a.replace(/^0 /, ''), b, c));
      } catch {
        skipped += 1;
      }
      i += 3;
    } else {
      skipped += 1;
      i += 1;
    }
  }
  return { records, skipped };
}

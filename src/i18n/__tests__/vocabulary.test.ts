/**
 * Enforces the mandatory vocabulary of SPEC §2.3 across all UI strings and components.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { en } from '../en';

const FORBIDDEN = [/high collision risk/i, /collision probability/i, /real[- ]time position/i, /collision predicted/i];

function collectStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (typeof value === 'function') out.push(String((value as (...a: string[]) => string)('X', 'X')));
  else if (value && typeof value === 'object') for (const v of Object.values(value)) collectStrings(v, out);
  return out;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sourceFiles(p);
    return /\.(tsx?|css)$/.test(name) ? [p] : [];
  });
}

describe('mandatory vocabulary (SPEC §2.3)', () => {
  it('no forbidden term in en.ts strings', () => {
    for (const s of collectStrings(en)) for (const re of FORBIDDEN) expect(s).not.toMatch(re);
  });

  it('no forbidden term anywhere in UI source code', () => {
    const root = join(__dirname, '..', '..');
    for (const file of sourceFiles(root)) {
      const text = readFileSync(file, 'utf8');
      for (const re of FORBIDDEN) expect(text, `${file} contains ${re}`).not.toMatch(re);
    }
  });

  it('uses the required wording for close approaches', () => {
    expect(en.proximity.alertTitle).toBe('Potential Close Approach — Requires Verification');
    expect(en.positions.estimated).toBe('Estimated position (SGP4)');
  });
});

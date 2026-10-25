/**
 * Minimal .env loader (no dependency). Values already present in the
 * environment win. Empty values (`KEY=`) are ignored, so an empty line never
 * hides a value from another file. The .env file is git-ignored; see .env.example.
 */
import { existsSync, readFileSync } from 'node:fs';

export function loadEnv(path: string): void {
  if (!existsSync(path)) return;
  // Strip a UTF-8 BOM (Windows editors sometimes add one).
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '');
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (!m || line.trimStart().startsWith('#')) continue;
    const key = m[1]!;
    let value = m[2]!;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (value === '') continue;
    if (!process.env[key]) process.env[key] = value;
  }
}

export interface ServerConfig {
  port: number;
  host: string;
  spacetrackIdentity: string;
  spacetrackPassword: string;
  n2yoApiKey: string;
  openaiApiKey: string;
}

export function readConfig(): ServerConfig {
  return {
    port: Number(process.env.ORBITAL_SERVER_PORT ?? 8787),
    host: process.env.ORBITAL_SERVER_HOST ?? '127.0.0.1',
    spacetrackIdentity: process.env.SPACETRACK_IDENTITY ?? '',
    spacetrackPassword: process.env.SPACETRACK_PASSWORD ?? '',
    n2yoApiKey: process.env.N2YO_API_KEY ?? '',
    openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  };
}

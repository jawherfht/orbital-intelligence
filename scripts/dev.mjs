/**
 * npm run dev — starts the local orbital-data server (port 8787) and the
 * Vite dev server (port 5173) together. Ctrl+C stops both. Works on Windows,
 * macOS and Linux without extra dependencies.
 */
import { spawn } from 'node:child_process';

const procs = [
  spawn(process.execPath, ['server/index.ts'], { stdio: 'inherit' }),
  spawn('npx', ['vite'], { stdio: 'inherit', shell: process.platform === 'win32' }),
];

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const p of procs) if (!p.killed) p.kill();
  process.exit(code);
};
for (const p of procs) p.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

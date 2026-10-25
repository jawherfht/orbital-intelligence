/**
 * npm run dev — starts the local orbital-data server (port 8787) and the
 * Vite dev server (port 5173) together. Ctrl+C stops both. Works on Windows,
 * macOS and Linux without extra dependencies.
 *
 * Both are started with the current Node binary (no shell), so arguments are
 * never concatenated into a command line. If the data server exits with code 0
 * (an instance is already running and is reused), Vite keeps running.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const viteBin = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');

const server = spawn(process.execPath, ['server/index.ts'], { stdio: 'inherit' });
const vite = spawn(process.execPath, [viteBin], { stdio: 'inherit' });

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  for (const p of [server, vite]) if (p.exitCode === null && !p.killed) p.kill();
  process.exit(code);
};

server.on('exit', (code) => {
  if (code === 0 && !stopping) return; // reusing an already-running data server
  stop(code ?? 1);
});
vite.on('exit', (code) => stop(code ?? 0));
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

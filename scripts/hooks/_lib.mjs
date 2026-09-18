import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Read the hook payload Claude Code sends on stdin. Never throws. */
export async function readPayload() {
  try {
    const chunks = [];
    for await (const c of process.stdin) chunks.push(c);
    const raw = Buffer.concat(chunks).toString('utf8').trim();
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function readFileSafe(p, fallback = '') {
  try {
    return existsSync(p) ? readFileSync(p, 'utf8') : fallback;
  } catch {
    return fallback;
  }
}

/** Run a command, returning trimmed stdout or null. Never throws. */
export function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: REPO,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: opts.timeout ?? 60_000,
      shell: process.platform === 'win32',
    }).trim();
  } catch {
    return null;
  }
}

/**
 * A hook that crashes is worse than a hook that does nothing: it interrupts a
 * session for a reason unrelated to the work. Every entry point goes through
 * this, so an internal error degrades to silence.
 */
export async function guarded(fn) {
  try {
    await fn();
  } catch (err) {
    if (process.env.FT_HOOK_DEBUG) console.error('[hook] ' + (err?.stack ?? err));
  }
  process.exit(0);
}

/** Block the tool call. Exit 2 routes stderr back to the model as feedback. */
export function block(message) {
  console.error(message);
  process.exit(2);
}

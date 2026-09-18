#!/usr/bin/env node
/**
 * UserPromptSubmit: put live provider health in front of the agent on every
 * turn.
 *
 * This is the highest-leverage hook in the repo. Without it the agent will
 * confidently propose a fix that routes through a provider which has been
 * returning 401 for an hour, and will rediscover the same outage repeatedly
 * across a session.
 */
import { join } from 'node:path';
import { guarded, readFileSafe, REPO } from './_lib.mjs';

await guarded(async () => {
  const status = readFileSafe(join(REPO, 'docs', 'PROVIDER_STATUS.md'));
  if (!status) return;

  const rows = [...status.matchAll(/^\|\s*`?([a-z][\w-]*)`?\s*\|\s*(\w+)\s*\|([^|\n]*)\|/gm)];
  if (!rows.length) return;

  const digest = rows
    .filter(([, id]) => id !== 'provider')
    .map(([, id, state, detail]) => {
      const d = detail.trim().replace(/\s+/g, ' ');
      return id + '=' + state + (d && d !== '-' ? '(' + d + ')' : '');
    })
    .join(' ');

  const asOf = status.match(/_Generated:\s*([^_\n]+)_/)?.[1]?.trim();
  console.log(
    'PROVIDERS: ' +
      digest +
      (asOf ? ' [as of ' + asOf + ']' : '') +
      '\nDo not propose a solution that depends on a TRIPPED provider without a fallback.',
  );
});

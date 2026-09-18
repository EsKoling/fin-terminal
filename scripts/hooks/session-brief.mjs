#!/usr/bin/env node
// SessionStart: orient the agent before it does anything.
import { join } from 'node:path';
import { guarded, readFileSafe, REPO, run } from './_lib.mjs';

await guarded(async () => {
  const lines = [];

  const roadmap = readFileSafe(join(REPO, 'docs', 'ROADMAP.md'));
  const phase = roadmap.match(/^##\s+(Phase\s+\d[^\n]*)/m);
  const current = roadmap.match(/^-\s+\[ \]\s+(.+)$/m);
  if (phase) lines.push('Phase: ' + phase[1].trim());
  if (current) lines.push('Next open task: ' + current[1].trim());

  const status = readFileSafe(join(REPO, 'docs', 'PROVIDER_STATUS.md'));
  const down = [...status.matchAll(/^\|\s*`?(\w[\w-]*)`?\s*\|\s*(TRIPPED|DEGRADED)\b/gm)];
  lines.push(
    down.length
      ? 'Providers needing attention: ' + down.map((m) => m[1] + '=' + m[2]).join(', ')
      : 'Providers: no known outages',
  );

  const log = run('git', ['log', '--oneline', '-3']);
  if (log) lines.push('Recent commits:\n' + log);

  const dirty = run('git', ['status', '--porcelain']);
  if (dirty) lines.push('Uncommitted changes in ' + dirty.split('\n').length + ' file(s)');

  if (lines.length) console.log('## fin-terminal\n\n' + lines.join('\n'));
});

#!/usr/bin/env node
/**
 * PostToolUse(Write|Edit): format, fix, and typecheck the touched file, then
 * hand any remaining errors back to the agent so it self-corrects without the
 * user having to notice.
 *
 * Scoped to the owning workspace rather than the whole monorepo: a full tsc on
 * every keystroke-sized edit is slow enough that it would get switched off.
 */
import { existsSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { guarded, readPayload, REPO, run } from './_lib.mjs';

const WORKSPACES = [
  ['packages/contracts', '@ft/contracts'],
  ['packages/symbology', '@ft/symbology'],
  ['packages/ui', '@ft/ui'],
  ['packages/market-data', '@ft/market-data'],
  ['packages/quant', '@ft/quant'],
  ['packages/ai', '@ft/ai'],
  ['packages/alerts', '@ft/alerts'],
  ['apps/web', 'web'],
];

await guarded(async () => {
  const path = (await readPayload())?.tool_input?.file_path;
  if (!path || !/\.(ts|tsx|mjs)$/.test(path) || !existsSync(path)) return;

  run('npx', ['prettier', '--write', JSON.stringify(path)], { timeout: 30_000 });
  run('npx', ['eslint', '--fix', JSON.stringify(path)], { timeout: 60_000 });

  const rel = relative(REPO, path).split(sep).join('/');
  const ws = WORKSPACES.find(([dir]) => rel.startsWith(dir + '/'));
  if (!ws) return;

  const problems = [];

  const tsc = run('npm', ['run', '--silent', '--workspace', ws[1], 'typecheck'], {
    timeout: 120_000,
  });
  if (tsc === null) {
    const detail = run(
      'npx',
      ['tsc', '-p', ws[0] + '/tsconfig.json', '--noEmit', '--pretty', 'false'],
      {
        timeout: 120_000,
      },
    );
    problems.push('Typecheck failed in ' + ws[1] + ':\n' + (detail ?? '(see npm run typecheck)'));
  }

  // The quant package is where a silent numerical regression does real damage,
  // so its tests run on every edit rather than only at Stop.
  if (rel.startsWith('packages/quant/')) {
    const t = run('npx', ['vitest', 'related', JSON.stringify(path), '--run'], {
      timeout: 120_000,
    });
    if (t === null) problems.push('Tests related to ' + rel + ' are failing.');
  }

  if (problems.length) {
    console.error(problems.join('\n\n'));
    process.exit(2);
  }
});

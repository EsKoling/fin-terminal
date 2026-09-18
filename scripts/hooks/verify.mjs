#!/usr/bin/env node
/**
 * Stop: run the gate over packages affected since HEAD before handing control
 * back. This is what makes the repo self-maintaining rather than decoratively
 * automated.
 *
 * Set FT_SKIP_VERIFY=1 to opt out during a long exploratory session.
 */
import { guarded, run } from './_lib.mjs';

await guarded(async () => {
  if (process.env.FT_SKIP_VERIFY) return;

  const changed = run('git', ['status', '--porcelain']);
  if (!changed) return;

  const touchesCode = changed
    .split('\n')
    .some((l) => /\.(ts|tsx|mjs|css|json)$/.test(l) && !/package-lock\.json/.test(l));
  if (!touchesCode) return;

  const out = run('npx', ['turbo', 'run', 'typecheck', 'lint', 'test', '--filter=...[HEAD]'], {
    timeout: 480_000,
  });

  if (out === null) {
    console.error(
      'Verification failed. Run `npm run verify:changed` to see the errors, and fix them ' +
        'before considering this work finished.',
    );
    process.exit(2);
  }
});

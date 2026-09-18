#!/usr/bin/env node
/**
 * PreToolUse(Write|Edit): two rules.
 *
 *  1. Secret scan. Never let a live key land in a tracked file.
 *  2. Contract lock. `@ft/contracts` is imported by every other package, so a
 *     change there ripples through the whole repo. It should be a deliberate
 *     decision the user makes, not a drive-by edit an agent makes to unblock
 *     itself.
 */
import { existsSync } from 'node:fs';
import { join, sep } from 'node:path';
import { block, guarded, readPayload, REPO } from './_lib.mjs';

const SECRETS = [
  [/\bgsk_[A-Za-z0-9]{20,}/, 'Groq key'],
  [/\bcsk-[A-Za-z0-9]{20,}/, 'Cerebras key'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/\bsk-[A-Za-z0-9]{32,}/, 'OpenAI-style key'],
  [/\bpostgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/, 'Postgres URL with an inline password'],
];

const ALLOW_SECRETS_IN = /(\.env\.example|CLAUDE\.md|README\.md|scripts\/hooks\/)/;
const CONTRACT_PATH = /packages\/contracts\/src\//;
const UNLOCK = join(REPO, '.claude', 'ALLOW_CONTRACT_CHANGE');

await guarded(async () => {
  const input = (await readPayload())?.tool_input ?? {};
  // Normalise separators so the path rules below behave the same on Windows.
  const path = (input.file_path ?? '').split(sep).join('/');
  const content = [input.content, input.new_string].filter((s) => typeof s === 'string').join('\n');

  if (content && !ALLOW_SECRETS_IN.test(path)) {
    for (const [re, why] of SECRETS) {
      if (re.test(content)) {
        block(
          'Blocked: this write contains what looks like a live ' +
            why +
            '.\n' +
            'Add the variable name to .env.example and read it from process.env instead.',
        );
      }
    }
  }

  if (CONTRACT_PATH.test(path) && !existsSync(UNLOCK)) {
    block(
      'Blocked: @ft/contracts is the shared spine and every package depends on it.\n' +
        'Ask the user before changing it. If they agree, create the empty file\n' +
        '  .claude/ALLOW_CONTRACT_CHANGE\n' +
        'to unlock, and delete it once the change is in.',
    );
  }
});

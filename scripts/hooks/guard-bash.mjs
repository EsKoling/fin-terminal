#!/usr/bin/env node
// PreToolUse(Bash): refuse the handful of commands that lose work or leak keys.
import { block, guarded, readPayload } from './_lib.mjs';

const DANGEROUS = [
  [/\brm\s+-[a-z]*[rf][a-z]*\s+[/~]/, 'recursive delete of a root or home path'],
  [/\bgit\s+push\b[^\n]*--force(?!-with-lease)/, 'force push without --force-with-lease'],
  [/\bgit\s+reset\s+--hard\b/, 'git reset --hard discards uncommitted work'],
  [/\bgit\s+clean\s+-[a-z]*f/, 'git clean -f deletes untracked files irreversibly'],
  [/\bnpm\s+publish\b/, 'these packages are private and must not be published'],
  [/\bcheckout\s+--\s+\./, 'checkout -- . discards all local changes'],
];

/**
 * Key shapes for the providers this project uses. Matching one in a command
 * line usually means a secret is about to be echoed into shell history or a
 * committed file.
 */
const SECRETS = [
  [/\bgsk_[A-Za-z0-9]{20,}/, 'Groq key'],
  [/\bcsk-[A-Za-z0-9]{20,}/, 'Cerebras key'],
  [/\bAIza[0-9A-Za-z_-]{30,}/, 'Google API key'],
  [/\bsk-[A-Za-z0-9]{32,}/, 'OpenAI-style key'],
  [/\bpostgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/, 'Postgres URL with an inline password'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key id'],
];

await guarded(async () => {
  const cmd = (await readPayload())?.tool_input?.command;
  if (typeof cmd !== 'string') return;

  for (const [re, why] of SECRETS) {
    if (re.test(cmd)) {
      block(
        'Blocked: this command line contains what looks like a ' +
          why +
          '.\n' +
          'Put it in .env.local (gitignored) and reference it as an env var instead.',
      );
    }
  }

  for (const [re, why] of DANGEROUS) {
    if (re.test(cmd)) {
      block('Blocked: ' + why + '.\nIf this is genuinely intended, ask the user to run it.');
    }
  }
});

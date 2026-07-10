// Push new CHANGELOG.md entries to Hermes after a git pull, so the household
// agent learns what changed and adapts (new tools, removed tools, behaviour).
// Called by infra/autopull.sh with the OLD and NEW commit shas:
//
//   bun run apps/backend/src/scripts/notify-changelog.ts <old_sha> <new_sha>
//
// Reads the Hermes webhook config from the env file (default /etc/haven/.env),
// so it works regardless of the caller's environment. No-op (exit 0) if the
// webhook isn't configured or the changelog didn't change — never fails a deploy.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const [, , oldSha, newSha] = process.argv;
if (!oldSha || !newSha) {
  console.error('[notify-changelog] usage: notify-changelog.ts <old_sha> <new_sha>');
  process.exit(0);
}

// Parse KEY=VALUE from the env file (used because autopull runs outside the
// backend's systemd EnvironmentFile). Missing file → empty config → no-op.
function readEnvFile(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m) out[m[1]!] = m[2]!.replace(/^["']|["']$/g, '');
    }
  } catch {
    /* no env file → no-op below */
  }
  return out;
}

const env = readEnvFile(process.env.HAVEN_ENV_FILE ?? '/etc/haven/.env');
const url = process.env.HERMES_WEBHOOK_URL ?? env.HERMES_WEBHOOK_URL;
const secret = process.env.HERMES_WEBHOOK_SECRET ?? env.HERMES_WEBHOOK_SECRET;

if (!url) {
  console.error('[notify-changelog] HERMES_WEBHOOK_URL unset — skipping');
  process.exit(0);
}

// Added lines of the CHANGELOG.md delta = the new entries.
const diff = spawnSync(
  'git',
  ['diff', `${oldSha}..${newSha}`, '--', 'CHANGELOG.md'],
  { encoding: 'utf8' },
);
const entries = (diff.stdout ?? '')
  .split('\n')
  .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
  .map((l) => l.slice(1))
  .join('\n')
  .trim();

if (!entries) {
  console.error('[notify-changelog] no CHANGELOG.md changes in range — skipping');
  process.exit(0);
}

const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 5000);
try {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { authorization: `Bearer ${secret}` } : {}),
    },
    body: JSON.stringify({ type: 'changelog.updated', from: oldSha, to: newSha, entries }),
    signal: controller.signal,
  });
  console.error(`[notify-changelog] sent ${entries.split('\n').length} line(s) → HTTP ${res.status}`);
} catch (e) {
  console.error(`[notify-changelog] failed (non-fatal): ${e instanceof Error ? e.message : String(e)}`);
} finally {
  clearTimeout(timer);
}
process.exit(0);

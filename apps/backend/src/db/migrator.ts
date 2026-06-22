import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from './client.ts';
import { squawkLint, type SquawkResult } from './squawk.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = resolve(__dirname, 'migrations');
const SQUAWK_CONFIG = resolve(__dirname, '../../../../.squawk.toml');

export type MigrationFile = {
  name: string;
  path: string;
  content: string;
  checksum: string;
};

export type Skipped = {
  name: string;
  reason: string;
  squawk?: SquawkResult;
};

export type MigrationResult = {
  applied: string[];
  skipped: Skipped[];
  pending: string[];
  error?: string;
};

function formatError(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as { code?: string }).code;
    const parts = [e.name, e.message, code].filter((p): p is string => Boolean(p));
    return parts.length ? parts.join(': ') : 'unknown error';
  }
  const s = String(e);
  return s && s !== '[object Object]' ? s : 'unknown error';
}

async function ensureMigrationsTable(): Promise<void> {
  await sql`
    create table if not exists _migrations (
      name text primary key,
      applied_at timestamptz not null default now(),
      checksum text not null,
      safety text not null check (safety in ('safe', 'unsafe-overridden')),
      squawk_output jsonb
    )
  `;
}

async function readMigrations(): Promise<MigrationFile[]> {
  let entries: string[];
  try {
    entries = await readdir(MIGRATIONS_DIR);
  } catch {
    return [];
  }
  const names = entries.filter((e) => e.endsWith('.sql')).sort();
  const out: MigrationFile[] = [];
  for (const name of names) {
    const path = join(MIGRATIONS_DIR, name);
    const content = await readFile(path, 'utf8');
    const checksum = createHash('sha256').update(content).digest('hex');
    out.push({ name, path, content, checksum });
  }
  return out;
}

async function listApplied(): Promise<Set<string>> {
  await ensureMigrationsTable();
  const rows = await sql<{ name: string }[]>`select name from _migrations`;
  return new Set(rows.map((r) => r.name));
}

export async function status(): Promise<MigrationResult> {
  try {
    const [files, applied] = await Promise.all([readMigrations(), listApplied()]);
    const appliedNames: string[] = [];
    const pending: string[] = [];
    for (const f of files) {
      if (applied.has(f.name)) appliedNames.push(f.name);
      else pending.push(f.name);
    }
    return { applied: appliedNames, skipped: [], pending };
  } catch (e) {
    return {
      applied: [],
      skipped: [],
      pending: [],
      error: formatError(e),
    };
  }
}

export async function migrate(): Promise<MigrationResult> {
  try {
    await ensureMigrationsTable();
    const files = await readMigrations();
    const applied = await listApplied();

    const appliedNow: string[] = [];
    const skipped: Skipped[] = [];
    const pending: string[] = [];

    for (const file of files) {
      if (applied.has(file.name)) continue;

      const lint = await squawkLint(file.path, SQUAWK_CONFIG);
      if (!lint.safe) {
        skipped.push({
          name: file.name,
          reason: lint.squawk_available
            ? `squawk flagged — apply with: bun run db:migrate:unsafe ${file.name} I-UNDERSTAND-THIS-IS-UNSAFE`
            : 'squawk unavailable — cannot lint',
          squawk: lint,
        });
        pending.push(file.name);
        continue;
      }

      await sql.begin(async (tx) => {
        await tx.unsafe(file.content);
        await tx`
          insert into _migrations (name, checksum, safety, squawk_output)
          values (${file.name}, ${file.checksum}, 'safe', ${JSON.stringify(lint)}::jsonb)
        `;
      });
      appliedNow.push(file.name);
    }

    return { applied: appliedNow, skipped, pending };
  } catch (e) {
    return {
      applied: [],
      skipped: [],
      pending: [],
      error: formatError(e),
    };
  }
}

const UNSAFE_CONFIRM = 'I-UNDERSTAND-THIS-IS-UNSAFE';

export async function migrateUnsafe(
  name: string,
  confirmToken: string,
): Promise<MigrationResult> {
  if (confirmToken !== UNSAFE_CONFIRM) {
    return {
      applied: [],
      skipped: [{ name, reason: `missing confirm token (pass "${UNSAFE_CONFIRM}")` }],
      pending: [],
      error: 'confirm token required',
    };
  }

  try {
    await ensureMigrationsTable();
    const files = await readMigrations();
    const file = files.find((f) => f.name === name);
    if (!file) {
      return {
        applied: [],
        skipped: [],
        pending: [],
        error: `migration ${name} not found`,
      };
    }
    const applied = await listApplied();
    if (applied.has(name)) {
      return {
        applied: [],
        skipped: [{ name, reason: 'already applied' }],
        pending: [],
      };
    }

    const lint = await squawkLint(file.path, SQUAWK_CONFIG);

    await sql.begin(async (tx) => {
      await tx.unsafe(file.content);
      await tx`
        insert into _migrations (name, checksum, safety, squawk_output)
        values (${file.name}, ${file.checksum}, 'unsafe-overridden', ${JSON.stringify(lint)}::jsonb)
      `;
    });
    return { applied: [name], skipped: [], pending: [] };
  } catch (e) {
    return {
      applied: [],
      skipped: [],
      pending: [],
      error: formatError(e),
    };
  }
}

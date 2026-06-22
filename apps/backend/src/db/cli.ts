#!/usr/bin/env bun
import { sql } from './client.ts';
import { migrate, migrateUnsafe, status, type MigrationResult } from './migrator.ts';

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function printResult(label: string, r: MigrationResult): void {
  console.log(`=== ${label} ===`);
  if (r.error !== undefined) console.log(`error: ${r.error}`);
  if (r.applied.length) console.log(`applied: ${r.applied.join(', ')}`);
  if (r.skipped.length) {
    console.log('skipped:');
    for (const s of r.skipped) {
      console.log(`  - ${s.name}: ${s.reason}`);
      if (s.squawk?.output) console.log(`    squawk: ${s.squawk.output}`);
    }
  }
  if (r.pending.length) console.log(`pending: ${r.pending.join(', ')}`);
  if (
    !r.applied.length &&
    !r.skipped.length &&
    !r.pending.length &&
    r.error === undefined
  ) {
    console.log('(nothing to do)');
  }
}

const cmd = process.argv[2];
const arg = process.argv[3];
const arg2 = process.argv[4];

let exitCode = 0;
try {
  switch (cmd) {
    case 'migrate': {
      const r = await migrate();
      printResult('migrate', r);
      if (r.error) exitCode = 1;
      break;
    }
    case 'status': {
      const r = await status();
      printResult('status', r);
      if (r.error) exitCode = 1;
      break;
    }
    case 'migrate-unsafe': {
      if (!arg)
        fail(
          'usage: db:migrate:unsafe <name> I-UNDERSTAND-THIS-IS-UNSAFE',
        );
      const r = await migrateUnsafe(arg, arg2 ?? '');
      printResult('migrate-unsafe', r);
      if (r.error) exitCode = 1;
      break;
    }
    default:
      fail('usage: db:cli <migrate|status|migrate-unsafe> [args]');
  }
} finally {
  await sql.end({ timeout: 5 });
}

process.exit(exitCode);

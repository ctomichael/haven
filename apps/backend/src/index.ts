import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';

import { pingDb } from './db/client.ts';
import { migrate, status as migrationStatus } from './db/migrator.ts';
import { squawkAvailable } from './db/squawk.ts';

const PORT = Number(process.env.PORT ?? 8080);
const STARTED_AT = new Date().toISOString();

// Run pending safe migrations on boot. Failures don't crash the server —
// the (forthcoming) /api/health upgrade reports the state for diagnosis.
async function runMigrationsOnBoot(): Promise<void> {
  try {
    const result = await migrate();
    if (result.error) {
      console.warn(`[haven-backend] migrate error: ${result.error}`);
      return;
    }
    if (result.applied.length) {
      console.log(
        `[haven-backend] applied ${result.applied.length} migration(s): ${result.applied.join(', ')}`,
      );
    }
    if (result.skipped.length) {
      console.warn(
        `[haven-backend] skipped ${result.skipped.length} migration(s):`,
      );
      for (const s of result.skipped) {
        console.warn(`  - ${s.name}: ${s.reason}`);
      }
    }
  } catch (e) {
    console.warn(
      `[haven-backend] migrate threw: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}
runMigrationsOnBoot();

const app = new Hono();

app.use('*', logger());
app.use('/api/*', cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }));

app.get('/', (c) => c.text('Haven backend — see /api/health'));

app.get('/api/health', async (c) => {
  const [db, migrations, squawk] = await Promise.all([
    pingDb(),
    migrationStatus(),
    squawkAvailable().then((available) => ({ available })),
  ]);

  const ok =
    db.ok &&
    migrations.error === undefined &&
    migrations.pending.length === 0;

  return c.json({
    ok,
    service: 'haven-backend',
    version: '0.0.0',
    started_at: STARTED_AT,
    now: new Date().toISOString(),
    db,
    migrations: {
      applied: migrations.applied,
      pending: migrations.pending,
      skipped: migrations.skipped,
      last_applied: migrations.applied.at(-1) ?? null,
      ...(migrations.error !== undefined && { error: migrations.error }),
    },
    squawk,
  });
});

// SSE: heartbeat every 3s plus a one-shot 'hello' on connect.
// This is the channel the dashboard subscribes to for 'dashboard:reload' and live updates later.
app.get('/api/events', (c) =>
  streamSSE(c, async (stream) => {
    let id = 0;
    await stream.writeSSE({
      id: String(id++),
      event: 'hello',
      data: JSON.stringify({ service: 'haven-backend', started_at: STARTED_AT }),
    });
    while (!stream.aborted) {
      await stream.writeSSE({
        id: String(id++),
        event: 'heartbeat',
        data: JSON.stringify({ ts: new Date().toISOString() }),
      });
      await stream.sleep(3000);
    }
  }),
);

console.log(`[haven-backend] listening on http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};

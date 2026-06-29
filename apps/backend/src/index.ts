import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';

import { pingDb } from './db/client.ts';
import { migrate, status as migrationStatus } from './db/migrator.ts';
import { squawkAvailable } from './db/squawk.ts';
import inboxRoute from './routes/inbox.ts';
import todosRoute from './routes/todos.ts';
import shoppingRoute from './routes/shopping.ts';
import { attachmentsUpload, attachmentsServe } from './routes/attachments.ts';
import voiceRoute from './routes/voice.ts';
import deployRoute from './routes/deploy.ts';
import weatherRoute from './routes/weather.ts';
import haRoute from './routes/ha.ts';
import { startReloadBridge, subscribe, type DashboardEvent } from './events.ts';

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

// Bridge the Postgres reload channel onto the in-process SSE bus, so writes
// from the MCP server (a separate process) push a refresh to every surface.
startReloadBridge();

const app = new Hono();

app.use('*', logger());
app.use('/api/*', cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }));

app.get('/', (c) => c.text('Haven backend — see /api/health'));

app.route('/api/inbox', inboxRoute);
app.route('/api/todos', todosRoute);
app.route('/api/shopping', shoppingRoute);
app.route('/api/attachments', attachmentsUpload);
app.route('/attachments', attachmentsServe);
app.route('/api/voice', voiceRoute);
app.route('/api/deploy', deployRoute);
app.route('/api/weather', weatherRoute);
app.route('/api/ha', haRoute);

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

// SSE: a one-shot 'hello' on connect, 'dashboard:reload' events pushed from
// the reload bus (NOTIFY haven_reload), and a heartbeat every 3s otherwise.
app.get('/api/events', (c) =>
  streamSSE(c, async (stream) => {
    let id = 0;
    await stream.writeSSE({
      id: String(id++),
      event: 'hello',
      data: JSON.stringify({ service: 'haven-backend', started_at: STARTED_AT }),
    });

    // Buffer events arriving between loop iterations; `wake` lets a fresh
    // event cut the 3s heartbeat wait short so reloads feel instant.
    const pending: DashboardEvent[] = [];
    let wake: (() => void) | null = null;
    const unsubscribe = subscribe((e) => {
      pending.push(e);
      wake?.();
    });

    try {
      while (!stream.aborted) {
        while (pending.length) {
          const e = pending.shift()!;
          await stream.writeSSE({
            id: String(id++),
            event: e.type,
            data: JSON.stringify(e),
          });
        }
        // Wait up to 3s for the next event, then fall through to heartbeat.
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            wake = null;
            resolve();
          }, 3000);
          wake = () => {
            clearTimeout(timer);
            wake = null;
            resolve();
          };
        });
        if (!pending.length && !stream.aborted) {
          await stream.writeSSE({
            id: String(id++),
            event: 'heartbeat',
            data: JSON.stringify({ ts: new Date().toISOString() }),
          });
        }
      }
    } finally {
      unsubscribe();
    }
  }),
);

console.log(`[haven-backend] listening on http://localhost:${PORT}`);

export default {
  port: PORT,
  fetch: app.fetch,
};

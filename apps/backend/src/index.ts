import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';

const PORT = Number(process.env.PORT ?? 8080);
const STARTED_AT = new Date().toISOString();

const app = new Hono();

app.use('*', logger());
app.use('/api/*', cors({ origin: ['http://localhost:5173', 'http://localhost:4173'] }));

app.get('/', (c) => c.text('Haven backend — see /api/health'));

app.get('/api/health', (c) =>
  c.json({
    ok: true,
    service: 'haven-backend',
    version: '0.0.0',
    started_at: STARTED_AT,
    now: new Date().toISOString(),
  }),
);

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

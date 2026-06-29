import { Hono } from 'hono';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { audit } from '../audit.ts';

// Trigger a deploy by touching a sentinel file. A systemd path unit
// (haven-deploy-trigger.path) watches the file and fires
// haven-autopull.service on modification. This keeps the backend
// process unprivileged — it just writes a file it already owns.
//
// Auth is a bearer token (HAVEN_DEPLOY_TOKEN). Endpoint is public via
// Caddy / Cloudflare Tunnel, so the token must be strong (≥32 random
// hex bytes — `openssl rand -hex 32`).

// Default to the production location. In dev, set HAVEN_DEPLOY_TRIGGER_PATH
// to something writable (e.g. /tmp/haven-deploy-pending) if you actually
// want to exercise this endpoint locally — the systemd .path unit only
// exists on the server, so dev hits just write a file with no side effect.
const SENTINEL_PATH =
  process.env.HAVEN_DEPLOY_TRIGGER_PATH ?? '/var/haven/.deploy-pending';

const deploy = new Hono();

deploy.post('/', async (c) => {
  const token = process.env.HAVEN_DEPLOY_TOKEN ?? '';
  if (!token) {
    return c.json(
      { error: 'deploy_token_unset', detail: 'set HAVEN_DEPLOY_TOKEN in /etc/haven/.env' },
      503,
    );
  }
  const got = c.req.header('authorization') ?? '';
  if (got !== `Bearer ${token}`) {
    void audit({
      tool: 'deploy_trigger',
      args: null,
      actor: undefined,
      resultStatus: 'error',
      details: { error: 'unauthorized' },
    });
    return c.json({ error: 'unauthorized' }, 401);
  }

  try {
    await writeFile(SENTINEL_PATH, `${new Date().toISOString()}\n`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    void audit({
      tool: 'deploy_trigger',
      args: null,
      actor: undefined,
      resultStatus: 'error',
      details: { error: msg, sentinel: SENTINEL_PATH },
    });
    return c.json({ error: 'sentinel_write_failed', detail: msg }, 500);
  }

  void audit({
    tool: 'deploy_trigger',
    args: null,
    actor: undefined,
    resultStatus: 'ok',
  });
  return c.json(
    {
      ok: true,
      sentinel: SENTINEL_PATH,
      message: 'deploy triggered — watch with `journalctl -u haven-autopull -f`',
    },
    202,
  );
});

export default deploy;

import { Hono } from 'hono';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { audit } from '../audit.ts';
import { sql } from '../db/client.ts';

// Dev default is repo-local; prod sets HAVEN_ATTACHMENTS_DIR=/var/haven/attachments
const ATTACHMENTS_DIR =
  process.env.HAVEN_ATTACHMENTS_DIR ??
  path.resolve(process.cwd(), '../../attachments');

const MIME_TO_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
};

function extFor(mime: string, fallbackName?: string): string {
  if (MIME_TO_EXT[mime]) return MIME_TO_EXT[mime]!;
  const m = fallbackName?.match(/\.[a-z0-9]+$/i);
  return m?.[0] ?? '.bin';
}

// ----- POST /api/attachments (upload) ---------------------------------

const uploadApp = new Hono();

uploadApp.post('/', async (c) => {
  let status: 'ok' | 'error' = 'ok';
  let errorDetail: unknown = null;
  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) {
      status = 'error';
      errorDetail = { error: 'missing_file_field' };
      return c.json({ error: 'missing_file_field' }, 400);
    }

    const now = new Date();
    const year = now.getUTCFullYear().toString();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const dir = path.join(ATTACHMENTS_DIR, year, month);
    await mkdir(dir, { recursive: true });

    const id = randomUUID();
    const ext = extFor(file.type, file.name);
    const filename = `${id}${ext}`;
    const relPath = `${year}/${month}/${filename}`;
    const absPath = path.join(dir, filename);

    const buf = await file.arrayBuffer();
    await writeFile(absPath, new Uint8Array(buf));

    const [row] = await sql<
      {
        id: string;
        path: string;
        mime: string;
        size_bytes: string;
        created_at: string;
      }[]
    >`
      insert into attachments (id, path, mime, size_bytes)
      values (${id}, ${relPath}, ${file.type || 'application/octet-stream'}, ${buf.byteLength})
      returning id, path, mime, size_bytes::text, created_at
    `;
    return c.json(
      {
        id: row!.id,
        url: `/attachments/${row!.path}`,
        mime: row!.mime,
        size_bytes: Number(row!.size_bytes),
        created_at: row!.created_at,
      },
      201,
    );
  } catch (e) {
    status = 'error';
    errorDetail = { error: e instanceof Error ? e.message : String(e) };
    return c.json({ error: 'internal' }, 500);
  } finally {
    void audit({
      tool: 'attachment_upload',
      args: null,
      actor: undefined,
      resultStatus: status,
      details: status === 'error' ? errorDetail : null,
    });
  }
});

// ----- GET /attachments/<year>/<month>/<file> (serve) -----------------

const serveApp = new Hono();

serveApp.get('/:year/:month/:filename', async (c) => {
  const { year, month, filename } = c.req.param();
  // Path-traversal guard
  if (
    !/^\d{4}$/.test(year) ||
    !/^\d{2}$/.test(month) ||
    !/^[a-zA-Z0-9._-]+$/.test(filename)
  ) {
    return c.text('Bad request', 400);
  }
  const filePath = path.join(ATTACHMENTS_DIR, year, month, filename);
  try {
    await stat(filePath);
  } catch {
    return c.notFound();
  }
  // Use Bun.file for efficient streaming
  return new Response(Bun.file(filePath));
});

export { uploadApp as attachmentsUpload, serveApp as attachmentsServe };

import { Hono } from 'hono';
import { spawn } from 'node:child_process';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

import { audit } from '../audit.ts';
import { sql } from '../db/client.ts';

// Local voice transcription via whisper.cpp.
//
// Pipeline: client uploads recorded audio → we save the original to the
// attachments dir → ffmpeg converts to 16 kHz mono PCM WAV → whisper.cpp
// transcribes → we return text + the original attachment metadata to
// the client. The WAV temp file is deleted; the original is kept.
//
// Required binaries (configured via env, with sensible defaults):
//   ffmpeg            (env FFMPEG_BIN)
//   whisper-cli       (env WHISPER_BIN)        — brew install whisper-cpp
//   ggml-*.bin model  (env WHISPER_MODEL)      — see .whisper/ in dev,
//                                                /etc/haven/.env in prod

const ATTACHMENTS_DIR =
  process.env.HAVEN_ATTACHMENTS_DIR ??
  path.resolve(process.cwd(), '../../attachments');
const FFMPEG_BIN = process.env.FFMPEG_BIN ?? 'ffmpeg';
const WHISPER_BIN = process.env.WHISPER_BIN ?? 'whisper-cli';
const WHISPER_MODEL =
  process.env.WHISPER_MODEL ??
  path.resolve(process.cwd(), '../../.whisper/ggml-base.en.bin');

const MIME_TO_EXT: Record<string, string> = {
  'audio/webm': '.webm',
  'audio/ogg': '.ogg',
  'audio/mp4': '.m4a',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
};

function extFor(mime: string, name?: string): string {
  if (MIME_TO_EXT[mime]) return MIME_TO_EXT[mime]!;
  const m = name?.match(/\.[a-z0-9]+$/i);
  return m?.[0] ?? '.webm';
}

function run(
  bin: string,
  args: string[],
  opts: { stdoutLimitBytes?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
      if (opts.stdoutLimitBytes && stdout.length > opts.stdoutLimitBytes) {
        proc.kill();
      }
    });
    proc.stderr.on('data', (d) => (stderr += d.toString()));
    proc.on('error', reject);
    proc.on('exit', (code) => resolve({ code: code ?? -1, stdout, stderr }));
  });
}

const voice = new Hono();

voice.post('/transcribe', async (c) => {
  let status: 'ok' | 'error' = 'ok';
  let errorDetail: unknown = null;
  let wavTempPath: string | null = null;

  try {
    const body = await c.req.parseBody();
    const file = body['file'];
    if (!(file instanceof File)) {
      status = 'error';
      errorDetail = { error: 'missing_file_field' };
      return c.json({ error: 'missing_file_field' }, 400);
    }

    // 1. Save the upload to the attachments dir
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

    // 2. Insert attachment row
    const [attRow] = await sql<
      {
        id: string;
        path: string;
        mime: string;
        size_bytes: string;
        created_at: string;
      }[]
    >`
      insert into attachments (id, path, mime, size_bytes)
      values (${id}, ${relPath}, ${file.type || 'audio/webm'}, ${buf.byteLength})
      returning id, path, mime, size_bytes::text, created_at
    `;

    // 3. Convert to 16 kHz mono WAV for whisper.cpp
    wavTempPath = absPath.replace(/\.[^.]+$/, '.wav');
    const ff = await run(FFMPEG_BIN, [
      '-y',
      '-i', absPath,
      '-ar', '16000',
      '-ac', '1',
      '-c:a', 'pcm_s16le',
      wavTempPath,
    ]);
    if (ff.code !== 0) {
      status = 'error';
      errorDetail = { stage: 'ffmpeg', code: ff.code, stderr: ff.stderr.slice(0, 500) };
      return c.json({ error: 'ffmpeg_failed', detail: ff.stderr.slice(0, 500) }, 500);
    }

    // 4. Transcribe with whisper.cpp
    //    -nt        no timestamps in output
    //    -nf        no fallback
    //    --no-prints  suppress non-transcript noise on stderr
    const ws = await run(WHISPER_BIN, [
      '-m', WHISPER_MODEL,
      '-f', wavTempPath,
      '-nt',
      '--no-prints',
    ], { stdoutLimitBytes: 200_000 });

    if (ws.code !== 0) {
      status = 'error';
      errorDetail = { stage: 'whisper', code: ws.code, stderr: ws.stderr.slice(0, 500) };
      return c.json({ error: 'whisper_failed', detail: ws.stderr.slice(0, 500) }, 500);
    }

    const text = ws.stdout.trim();

    return c.json({
      text,
      attachment: {
        id: attRow!.id,
        url: `/attachments/${attRow!.path}`,
        mime: attRow!.mime,
        size_bytes: Number(attRow!.size_bytes),
        created_at: attRow!.created_at,
      },
    });
  } catch (e) {
    status = 'error';
    errorDetail = { error: e instanceof Error ? e.message : String(e) };
    return c.json({ error: 'internal' }, 500);
  } finally {
    if (wavTempPath) {
      await unlink(wavTempPath).catch(() => {
        /* ignore */
      });
    }
    void audit({
      tool: 'voice_transcribe',
      args: null,
      actor: undefined,
      resultStatus: status,
      details: status === 'error' ? errorDetail : null,
    });
  }
});

export default voice;

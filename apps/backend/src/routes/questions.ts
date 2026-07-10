import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

import { audit } from '../audit.ts';
import { sql } from '../db/client.ts';
import { notifyHermes } from '../services/hermes.ts';

// Read + answer side of agent questions. question_ask (MCP) creates them and
// pushes the SSE modal; the surface lists open ones here (SSE-miss fallback)
// and POSTs the answer, which resumes a fresh Hermes run via the webhook.

const questions = new Hono();

const ListQuery = z.object({
  surface: z.enum(['wall', 'phone', 'all']).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

// GET /api/questions — open (unanswered, unexpired) questions for a surface.
questions.get('/', zValidator('query', ListQuery), async (c) => {
  const args = c.req.valid('query');
  const rows = await sql`
    select id, question, options, target_surface, target_user, created_at, expires_at
    from agent_questions
    where answered_at is null
      and (expires_at is null or expires_at > now())
      and (${args.surface ?? null}::text is null
           or target_surface = 'all' or target_surface = ${args.surface ?? null})
    order by created_at desc
    limit ${args.limit}
  `;
  return c.json({ questions: rows });
});

const IdParam = z.object({ id: z.string().uuid() });
const AnswerBody = z.object({
  answer: z.string().min(1),
  answered_by: z.string().optional(),
});

// POST /api/questions/:id/answer — record + resume the pending Hermes work.
questions.post(
  '/:id/answer',
  zValidator('param', IdParam),
  zValidator('json', AnswerBody),
  async (c) => {
    const { id } = c.req.valid('param');
    const { answer, answered_by } = c.req.valid('json');
    let status: 'ok' | 'error' = 'ok';
    let detail: unknown = null;
    try {
      // Only the first answer wins (a question answered on Telegram may race
      // the modal). Returns the row so we can hand `context` to Hermes.
      const rows = await sql<{ id: string; context: Record<string, unknown> }[]>`
        update agent_questions
        set answer = ${answer}, answered_by = ${answered_by ?? null}, answered_at = now()
        where id = ${id} and answered_at is null
        returning id, context
      `;
      if (rows.length === 0) {
        // Either not found or already answered — distinguish for the caller.
        const [exists] = await sql<{ id: string }[]>`select id from agent_questions where id = ${id}`;
        return c.json(
          exists ? { ok: true, already_answered: true } : { error: 'not_found' },
          exists ? 200 : 404,
        );
      }
      void notifyHermes({
        type: 'question.answered',
        question_id: id,
        answer,
        answered_by,
        context: rows[0]!.context,
      });
      return c.json({ ok: true });
    } catch (e) {
      status = 'error';
      detail = { error: e instanceof Error ? e.message : String(e) };
      return c.json({ error: 'internal' }, 500);
    } finally {
      void audit({
        tool: 'question_answer',
        args: { id, answered_by },
        actor: answered_by,
        resultStatus: status,
        details: status === 'error' ? detail : null,
      });
    }
  },
);

export default questions;

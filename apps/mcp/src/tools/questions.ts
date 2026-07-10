import { z } from 'zod';

import { sql } from '../client.ts';
import { asJson } from '../jsonb.ts';
import { ACTOR } from '../schemas.ts';
import { notifyEvent } from '../reload.ts';

// Agent questions: the two-way channel on the Haven surfaces. Hermes asks a
// clarification/approval; the wall/phone shows a modal; the answer POSTs back
// and (via the backend webhook) resumes a fresh Hermes run using `context`.
// Approvals in Phase 4 ride the same rails (options=[approve, reject]).

type QuestionRow = {
  id: string;
  question: string;
  options: unknown;
  context: unknown;
  target_surface: string;
  target_user: string | null;
  created_at: string;
  expires_at: string | null;
  answer: string | null;
  answered_by: string | null;
  answered_at: string | null;
};

// ----- question_ask ----------------------------------------------------

export const questionAskSchema = {
  question: z.string().min(1).describe('The question to show the household.'),
  options: z
    .array(z.string())
    .default([])
    .describe('Preset answers; empty → free-text.'),
  context: z
    .record(z.unknown())
    .default({})
    .describe("What a fresh run needs to resume, e.g. { resume: 'household-intake', inbox_id }."),
  target_surface: z.enum(['wall', 'phone', 'all']).default('all'),
  target_user: z.string().optional().describe('User handle to direct it at, if personal.'),
  expires_at: z.string().datetime().optional(),
  actor: ACTOR,
};

export async function questionAsk(args: {
  question: string;
  options: string[];
  context: Record<string, unknown>;
  target_surface: 'wall' | 'phone' | 'all';
  target_user?: string;
  expires_at?: string;
}) {
  const rows = await sql<QuestionRow[]>`
    insert into agent_questions
      (question, options, context, target_surface, target_user, expires_at)
    values (
      ${args.question}, ${asJson(args.options)}, ${asJson(args.context)},
      ${args.target_surface}, ${args.target_user ?? null}, ${args.expires_at ?? null}
    )
    returning *
  `;
  const q = rows[0]!;
  // Push a modal to the surfaces immediately.
  await notifyEvent('agent:question', {
    surface: q.target_surface,
    question: { id: q.id, question: q.question, options: q.options, target_user: q.target_user },
  });
  return q;
}

// ----- question_get ----------------------------------------------------

export const questionGetSchema = {
  id: z.string().uuid().describe('agent_questions id'),
  actor: ACTOR,
};

export async function questionGet(args: { id: string }) {
  const [row] = await sql<QuestionRow[]>`
    select * from agent_questions where id = ${args.id}
  `;
  if (!row) {
    const err = new Error(`question ${args.id} not found`);
    (err as { code?: string }).code = 'not_found';
    throw err;
  }
  return row;
}

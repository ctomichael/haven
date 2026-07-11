import { createHmac } from 'node:crypto';
// Push new captures to the Hermes agent so it processes them immediately
// rather than waiting for its sweeper cron. Fire-and-forget: Hermes being
// down (or unconfigured) must never fail the capture that triggered it —
// the sweeper (inbox_list status=pending) is the backstop.
//
// Only capture-surface items (phone/wall PWA → POST /api/inbox) go through
// here. Telegram messages already reach Hermes via its gateway, and MCP
// inbox_append is called *by* an agent that is already aware of the item —
// so neither needs a push.
//
// Config (in /etc/haven/.env; unset on the laptop → no-op):
//   HERMES_WEBHOOK_URL     e.g. http://localhost:8765/hooks/haven
//   HERMES_WEBHOOK_SECRET  shared secret sent as a bearer token

const WEBHOOK_URL = process.env.HERMES_WEBHOOK_URL;
const WEBHOOK_SECRET = process.env.HERMES_WEBHOOK_SECRET;
const TIMEOUT_MS = 4000;

export type InboxPush = {
  type: 'inbox.new';
  inbox_id: string;
  ts: string;
  source: string;
  raw_text: string;
  actor?: string;
  device?: string;
};

export type QuestionAnswered = {
  type: 'question.answered';
  question_id: string;
  answer: string;
  answered_by?: string;
  context?: Record<string, unknown>;
};

export type ChangelogUpdated = {
  type: 'changelog.updated';
  from: string;
  to: string;
  entries: string; // the new CHANGELOG.md entries (added lines of the OLD..NEW delta)
};

type HermesEvent = InboxPush | QuestionAnswered | ChangelogUpdated;

export function hermesConfigured(): boolean {
  return Boolean(WEBHOOK_URL);
}

/**
 * Best-effort POST of an event to the Hermes webhook. Never throws; logs a
 * warning on failure and returns false. Times out so a hung Hermes can't
 * pin a request handler open.
 */
export async function notifyHermes(event: HermesEvent): Promise<boolean> {
  if (!WEBHOOK_URL) return false;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const body = JSON.stringify(event);
    const signature = WEBHOOK_SECRET
      ? createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex')
      : '';
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(WEBHOOK_SECRET ? { 'x-webhook-signature': signature } : {}),
      },
      body,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[hermes] webhook ${event.type} → HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(
      `[hermes] webhook ${event.type} failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

# Hermes setup for Haven

One-time wiring on the Beelink (where both Hermes and Haven run). Assumes
`hermes-agent` is installed and its gateway (Telegram) already works.

## 1. Attach HouseholdMCP

HouseholdMCP is a stdio MCP server. Add it to `~/.hermes/config.yaml`:

```yaml
mcp_servers:
  household:
    command: bun
    args: ["run", "/opt/haven/apps/mcp/src/index.ts"]
    env:
      HAVEN_MCP_AGENT_ID: hermes
      DATABASE_URL: postgres://haven:...@localhost:5432/haven   # same as backend
```

Tools then appear to Hermes namespaced `mcp_household_<tool>` (e.g.
`mcp_household_shopping_add`). Confirm with `hermes` → ask it to list tools,
or check the gateway log. `HAVEN_MCP_AGENT_ID: hermes` makes every call
attributable to Hermes in `audit_log`.

> The MCP process needs `DATABASE_URL` in its `env:` block — hermes-agent
> only passes an allowlisted env through to MCP subprocesses, so it won't be
> inherited from the shell.

## 2. Inbox webhook (push intake)

So captures from the phone/wall PWA reach Hermes within seconds (not just on
the sweeper), the Haven backend POSTs each new capture to a Hermes **webhook
channel**. Enable a webhook gateway channel in Hermes and point Haven at it.

In `/etc/haven/.env` (backend reads these — see
[`../../apps/backend/src/services/hermes.ts`](../../apps/backend/src/services/hermes.ts)):

```
HERMES_WEBHOOK_URL=http://localhost:8765/hooks/haven
HERMES_WEBHOOK_SECRET=<shared-secret>
```

The backend sends `Authorization: Bearer <secret>` with a JSON body:

```json
{ "type": "inbox.new", "inbox_id": "...", "ts": "...", "source": "phone",
  "raw_text": "...", "actor": "michael", "device": "phone_michael" }
```

Configure the webhook channel to run the `household-intake` skill on receipt,
passing `inbox_id`. If the webhook is unset (e.g. on the laptop) the backend
silently no-ops and the sweeper cron is the only intake path — still correct,
just not instant.

> The same endpoint later receives `{ "type": "question.answered", ... }`
> when a user answers an agent question on the Haven modal (Phase 3) — route
> that to resume the pending work using the question's `context`.

## 3. Cron jobs

Register via Hermes' cron tool (`hermes` → "create a cron job …", or the TUI).

| Name | Schedule | Mode | Prompt / script |
|---|---|---|---|
| `haven-intake-sweeper` | `*/15 * * * *` | agent | "Run the household-intake skill for every raw_inbox item still pending. Use `mcp_household_inbox_list status=pending older_than=10m`." |
| `haven-review` | `0 */3 * * *` | agent | "Run the household-review skill." *(Phase 3)* |
| `haven-morning` | `30 7 * * *` | agent | "Run the household-review skill, then send Fiona & Michael the morning digest on Telegram." *(Phase 3)* |
| `haven-notes-export` | `0 3 * * *` | **script** (`no_agent`) | `bun run /opt/haven/apps/backend/src/scripts/export-notes.ts` — dumps notes to `/var/haven/notes/`. |

The sweeper is the backstop for the push webhook: anything the webhook missed
(Hermes was down, backend restarted mid-flight) gets picked up within 15 min.
Idempotency comes from status — the skill only touches `pending` items and
claims each with `inbox_set_status status=processing expect=pending` first.

## 4. USER.md seed

Seed `~/.hermes/memories/USER.md` with the household facts intake needs so it
rarely has to ask. Keep it short (it's injected every session):

```markdown
# Household
- Michael and Fiona (married). Home town: Queenstown, NZ.
- Nico is our son. "Nico's food" = his usual brand (ask once, then remember here).
- Shared family Google Calendar is the calendar for appointments.
- Default currency NZD; default timezone Pac/Auckland.

# Conventions
- When someone says "we need to …" with a date, it's a todo with a due date.
- Prefer the reversible action when an intent is ambiguous; confirm in Telegram.
```

Anything intake has to ask about (e.g. what "Nico's food" means) should be
written back here **and** stored as a Haven note (`note_append`, Phase 2) so
both the agent and the household data remember it.

## 5. Google Calendar write-back (one-time)

So `calendar_event_create` can write to the shared family calendar:

1. In Google Cloud Console: create a project, enable the **Google Calendar
   API**, create an **OAuth 2.0 Client ID** (type: Desktop app).
2. Run a one-time consent flow (any OAuth helper) requesting scope
   `https://www.googleapis.com/auth/calendar.events`, signed in as the account
   that owns the shared family calendar. Capture the **refresh token**.
3. Find the shared calendar's id (Calendar settings → *Integrate calendar* →
   Calendar ID, ends `@group.calendar.google.com`).
4. Put these in `/etc/haven/.env` (never commit):

   ```
   GOOGLE_OAUTH_CLIENT_ID=...
   GOOGLE_OAUTH_CLIENT_SECRET=...
   GOOGLE_OAUTH_REFRESH_TOKEN=...
   HAVEN_GCAL_CALENDAR_ID=...@group.calendar.google.com
   HAVEN_TZ=Pacific/Auckland
   ```

Reads still come from the ICS feed (`HAVEN_CALENDAR_ICS_URL`); point that at
the **same** shared calendar so created events show on the wall within ~15 min.
Until these are set, `calendar_event_create` returns `not_configured` and the
intake skill should fall back to a dated todo. Check with
`curl localhost:8080/api/calendar/config`.

## 6. Command allowlist (for dispatch — Phase 5)

So `widget_dispatch` can run `claude -p` unattended, add the invocation to
Hermes' `command_allowlist` in `config.yaml`. Until Phase 5 this isn't needed.

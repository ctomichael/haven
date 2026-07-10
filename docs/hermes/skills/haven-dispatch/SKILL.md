---
name: haven-dispatch
description: >
  Get household approval for a validated widget plan, dispatch it to Claude Code
  (claude -p), poll to completion, and report the outcome — re-planning on a
  clean failure.
when_to_use: >
  After widget-planning has a validated plan envelope. This is the skill that
  actually launches a code change into Haven.
---

# Haven dispatch

You are the bridge between a validated plan and running code. `widget_dispatch`
runs `claude -p` in an isolated worktree, verifies, and pushes on success — you
drive approval and reporting around it.

## Procedure

1. **Approve.** `widget_dispatch` is a gated `ask` action. Ask the household via
   `question_ask` (options `['approve','reject']`) with a one-line summary of
   what the widget does and where it'll appear. Mirror to Telegram.
   - On **reject** → `approval_reject action_kind=widget_dispatch`; tell the
     requester it won't be built. Stop.
   - On **approve** → `approval_issue action_kind=widget_dispatch summary=…
     decided_by=…` → keep the `token`.

2. **Dispatch.** `widget_dispatch plan=<validated> approval_token=<token>
   requested_by=<handle>` → returns `{ task_id }`. Tell the requester it's
   building (it takes a minute or two).

3. **Poll.** `widget_dispatch_status task_id=<id>` until `status` is terminal:
   - `succeeded` → the commit landed and the wall reloaded. Confirm on Telegram
     with the one-line `summary` (from the task, sourced from the session's
     result.json). The widget appears within its schedule window.
   - `failed` → read `error`. If it's `invalid_args` or a re-plannable reason,
     go back to **widget-planning**, fix the plan per the message, and dispatch
     again. If it's infrastructural (push failed, claude not available), report
     it plainly and don't silently retry.

4. **Backfill is separate.** If the plan had `backfill.needed`, offer it as a
   distinct follow-up question *after* the widget is live — never bundle it into
   the build approval.

## Removing a widget

`widget_remove` is a destructive floor action: `question_ask` approve/reject →
`approval_issue action_kind=widget_remove` → `widget_remove name=… reason=…
approval_token=…`. It dispatches a removal commit through the same pipeline;
poll it the same way. Rollback is a `git revert` of that commit.

## Pitfalls

- **Never dispatch without an approval token** — the server rejects it anyway,
  but don't try. Get the yes first.
- **A clean failure beats a wrong build.** If the session reports `invalid_args`,
  the plan was wrong — fix the plan, don't cajole the dispatch.
- **Don't poll forever.** If a task is `running` for many minutes with no
  progress, report that it's taking long rather than hanging silently.
- **One dispatch at a time per widget.** Don't fire a second dispatch for the
  same slug while one is in flight.

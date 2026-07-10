---
name: changelog-interpret
description: >
  Read new Haven CHANGELOG.md entries after a deploy and adapt: adopt new MCP
  tools, stop using removed ones, absorb behaviour changes, and update memory so
  the change sticks across sessions.
when_to_use: >
  On a `changelog.updated` webhook event (sent by infra/autopull.sh after each
  git pull). The event carries the new entries in `entries`.
---

# Changelog interpret

Haven's code changes underneath you. This is how you keep up: every deploy sends
you the new `CHANGELOG.md` entries, each with a **What** and a **Hermes** line
written for you specifically. Act on the Hermes line.

## Procedure

1. **Read `entries`** from the event — one or more blocks:
   ```
   ## <date> — <title>
   **What:** …
   **Hermes:** …
   ```

2. **For each entry, act on the Hermes line:**
   - *New tools* — note the new `mcp_household_*` names and which skill uses them.
     If a named skill is mentioned you don't have, that's fine — you'll get it.
   - *Removed/renamed tools* — **stop calling the old name.** Add a note so you
     don't reach for it out of habit.
   - *Behaviour change* — a default changed (e.g. an action became `auto`, a new
     approval requirement) — adjust how you act accordingly.
   - *"no action"* — nothing to do; skip.

3. **Persist what matters** so it survives your fresh-per-run lifetime:
   - Add durable facts to `MEMORY.md` (e.g. "widget dispatch exists; use
     widget-planning → haven-dispatch"), not just this session.
   - If a change affects the household directly (a new capability they'd want to
     know about), consider a one-line Telegram heads-up — but don't spam;
     internal refactors need no announcement.

4. **Don't act on the code itself.** You interpret the changelog; you never pull,
   build, or edit the repo. Code changes reach Haven only through
   `widget_dispatch` (the haven-dispatch skill).

## Pitfalls

- **The `entries` are the delta since the last deploy** — you don't need to
  track what you've already seen; only new lines are sent. Don't re-process the
  whole file.
- **Trust the Hermes line over the What line** for what to do — What is context,
  Hermes is the instruction.
- **A removed tool is the dangerous case** — calling a tool that no longer exists
  fails a household action. Prioritise catching those.
- **Keep memory tidy** — one durable note per real capability, not one per
  deploy. Supersede rather than pile up.

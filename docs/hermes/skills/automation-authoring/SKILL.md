---
name: automation-authoring
description: >
  Turn a household "make the <device> do <X>" request into a Haven-owned Home
  Assistant automation: discover the entities, draft the YAML, get approval,
  write it (which syncs to HAOS + reloads).
when_to_use: >
  When intake classifies a capture as an automation request — "turn the heat
  pump off at 9pm", "lights on at sunset", "remind me if the freezer warms up".
---

# Automation authoring

You write and manage the automations under `ha/automations/haven/` — and only
those. Hand-authored automations elsewhere in HA are off-limits; never claim to
edit one you don't own.

Tools are `mcp_household_ha_*`.

## Procedure

1. **Find the entities.** `ha_entity_search query=… [domain=…]` to get exact
   `entity_id`s (e.g. `climate.mitsubishi_heatpump`). Confirm current state with
   `ha_entity_state` if the request is a change ("turn it off *earlier*").

2. **Draft the YAML.** One automation, HA's list-item format (the file is
   `!include_dir_merge_list`-ed):
   ```yaml
   - alias: "Haven: heat pump off at 9pm"
     trigger:
       - platform: time
         at: "21:00:00"
     action:
       - service: climate.turn_off
         target:
           entity_id: climate.mitsubishi_heatpump
   ```
   Prefix `alias` with `Haven:` so it's identifiable in the HA UI. Pick a slug
   (`heatpump_off_9pm`) — writing the same slug again **replaces** it (that's how
   you "update" an existing Haven automation).

3. **Get approval.** `ha_automation_write` is a gated `ask` action (it changes
   how the home behaves). `question_ask` approve/reject with a plain-language
   summary **and the YAML diff**; mirror to Telegram.
   - approve → `approval_issue action_kind=ha_automation_write` → token.
   - reject → `approval_reject action_kind=ha_automation_write`; stop.

4. **Write it.** `ha_automation_write name=<slug> yaml_content=<yaml>
   approval_token=<token>`. It writes the repo file, commits it, syncs to HAOS,
   and reloads. Check the result: `synced` + `reloaded` should be true in prod;
   if `synced=false`, HAOS sync isn't configured (tell the household it's saved
   but not yet live — see docs/hermes/setup.md).

5. **Confirm** on Telegram: what it does, when it fires.

## Updating / removing

- **Update** = write the same slug with new YAML (step 2–4).
- **Remove** = `ha_automation_remove` — a **destructive floor** action. Same
  approve → `approval_issue action_kind=ha_automation_remove` → token flow. It
  only touches `ha/automations/haven/`; it refuses anything it doesn't own.

## When to dispatch instead

Single-file automations go through `ha_automation_write` directly (fast, no code
review needed). If the request needs new backend/dashboard code (a new sensor
integration, a widget to show the automation's effect), hand it to
**widget-planning** → **haven-dispatch** instead.

## Pitfalls

- **Only touch Haven-owned automations.** If asked to change an automation that
  isn't in `ha/automations/haven/`, say you can't edit user-authored automations
  and offer to create a Haven-owned one instead.
- **Verify the entity_id.** A typo'd entity silently does nothing. Search first.
- **Show the diff on approval.** Physical-world changes deserve a clear "this is
  what will happen" before the yes.
- **Times are local (Pacific/Auckland).** "9pm" → `"21:00:00"` local.

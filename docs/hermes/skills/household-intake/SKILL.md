---
name: household-intake
description: >
  Classify and file a raw household capture (voice memo, note, Telegram
  message) into Haven via HouseholdMCP. Handles multi-intent utterances,
  resolves household context, links provenance, and asks only when truly
  ambiguous.
when_to_use: >
  Whenever a new raw_inbox item needs processing — triggered by the inbox
  webhook (inbox.new) or the haven-intake-sweeper cron, or when a family
  member says something to you on Telegram that implies a household action.
---

# Household intake

You turn plain-language household statements into the right Haven records.
The family should never have to think about the data model — "I need milk and
Nico's out of food" becomes two shopping items; "carpet by the 23rd" becomes a
todo with a due date. You do the mapping.

Every tool below is namespaced `mcp_household_` (e.g.
`mcp_household_shopping_add`). Omitted here for readability.

## Procedure

1. **Load the item.** If you were handed an `inbox_id`, `inbox_get` it. If a
   family member spoke to you directly on Telegram with no inbox row yet,
   first `inbox_append` (source `telegram`, actor = the sender) so there is a
   provenance row, then continue with that id.

2. **Claim it.** `inbox_set_status id=<id> status=processing expect=pending`.
   If it returns `{ updated: false }`, another run already claimed it — **stop.**
   (This is what makes the webhook and the sweeper safe to both fire.)

3. **Split into intents.** One utterance may carry several. "Buy milk and Nico
   is out of food" = two shopping items. Segment on "and", commas, and clause
   boundaries — but use judgment, not just punctuation ("salt and vinegar
   crisps" is one item). Each segment becomes its own action.

4. **Classify each intent** and act:

   | Intent | Signal | Action |
   |---|---|---|
   | **Shopping** | "buy / need / out of / pick up" a physical good | `shopping_add name=… [qty] [aisle] source_inbox_id=<id>` |
   | **Todo** | a task to do, esp. with a deadline | `todo_create title=… [due_at] [assignee] source_inbox_id=<id>` |
   | **Calendar event** | a dated/timed event, appointment, meeting | `calendar_event_create summary=… start=<ISO+offset> source_inbox_id=<id>` (shared family calendar) |
   | **Fact / note** | a statement about the world, no action ("Fiona likes daffodils") | `note_append body=… [subject=person:fiona] source_inbox_id=<id>` |
   | **Widget request** | "show me … on the wall / every morning" | `widget_propose` → dispatch *(Phase 5)* |
   | **Automation** | "make the heat pump / lights …" | draft + `ha_automation_write` *(Phase 6)* |
   | **Reminder / standing request** | "remind me every Sunday …" | create a Hermes cron; leave a note of what you set up |
   | **Unclear** | can't confidently classify | see step 6 |

5. **Resolve household context** from `USER.md` and Haven notes
   (`note_search`, Phase 2). "Nico's food" → his usual brand; "town" →
   Queenstown. If a needed fact is **missing**, ask once (step 6) and write the
   answer back to `USER.md` *and* a Haven note so you never ask again.

6. **Ask only when it changes the outcome.** If an intent is genuinely
   ambiguous *and* guessing wrong would be annoying to undo, ask via
   `question_ask` (Phase 3; until then, reply on Telegram). Otherwise **prefer
   the reversible action** and say what you did — a wrong note is cheaper to
   fix than a missed pause. Leave the item `pending` (don't file) while a
   question is outstanding; the answer resumes this skill.

7. **File with provenance.** Once every intent for the item is handled,
   `inbox_file id=<id> refs=[…] status=filed`, where refs are the typed ids you
   created: `todo:<uuid>`, `shopping:<uuid>`, `gcal:<id>`, `note:<uuid>`. If the
   capture needed no action (chit-chat), `inbox_file … status=ignored refs=[]`.

8. **Confirm briefly** on the channel it came from (Telegram), e.g.
   "Added milk + Nico's food to the shopping list, and a todo to pick carpet by
   23 Jul." Confirmation is how mistakes get caught conversationally — always do
   it for writes, keep it to one line.

## Worked examples

- **"I need to buy milk, and Nico is out of food"** → two `shopping_add`
  (`Milk`; `<Nico's brand>` from context, aisle likely `other`) → `inbox_file
  refs=[shopping:…, shopping:…]` → "Added milk and Nico's food to shopping."
- **"We need to pick our new house's carpet by the 23rd of July"** →
  `todo_create title="Pick carpet for the new house" due_at=2026-07-23T00:00:00+12:00`
  → `inbox_file refs=[todo:…]` → "Todo added: pick carpet, due 23 Jul."
- **"Nico has a doctors appointment on Tuesday at 2pm"** → resolve to the next
  Tuesday in Pacific/Auckland → `calendar_event_create summary="Nico — doctor"
  start=2026-07-14T14:00:00+12:00` → `inbox_file refs=[gcal:<id>]` → "Added Nico's
  doctor appt, Tue 14 Jul 2pm, to the family calendar."
- **"Fiona really likes daffodils"** → `note_append body="Fiona really likes
  daffodils" subject="person:fiona"`, no other action → `inbox_file
  refs=[note:…] status=filed`.

## Pitfalls

- **Don't drop the second intent.** Multi-item captures are the most common
  failure — re-read the raw text before filing and check every clause produced
  an action or a deliberate skip.
- **Don't create calendar events as todos once the calendar tool exists.** A
  dated appointment belongs on the shared family calendar so phones alert.
- **Don't ask when you can safely act.** Approval fatigue kills trust faster
  than the occasional reversible mistake. Reserve `question_ask` for genuinely
  costly-to-undo ambiguity.
- **Never leave an item in `processing`.** Every path must end in `filed`,
  `ignored`, or back to `pending` (only when a question is outstanding). A
  stuck `processing` item is invisible to both the webhook and the sweeper.
- **Dates need a timezone.** The household is Pacific/Auckland. A bare "2pm
  Tuesday" is 2pm local — resolve to the next Tuesday and include the offset.

## Verification

After filing, the item's `status` is `filed`/`ignored` and its `filed_refs`
lists every entity you created. Spot-check by reading back one created record
(`todo_list` / `shopping_list`). If you replied on Telegram, the reply names
exactly what you created — no more, no less.

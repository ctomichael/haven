# Haven-owned Home Assistant automations

**Everything in this directory is written and owned by Haven** (via the
`ha_automation_write` / `ha_automation_remove` MCP tools). Each file is one
automation, named `<slug>.yaml`.

Do **not** hand-edit these — they can be overwritten or removed by the agent.
Hand-authored automations live elsewhere in the HA config and Haven never
touches them (CLAUDE.md rule).

## How it reaches Home Assistant

The repo is the source of truth; a one-way sync copies these files onto HAOS:

1. **One-time HA setup** — include this directory in `configuration.yaml`:
   ```yaml
   automation haven: !include_dir_merge_list automations/haven/
   ```
   and make the files reachable from the HAOS config dir (Samba/SSH add-on, or a
   symlink), then restart HA once.
2. **On write** — `ha_automation_write` writes the file here, copies it to
   `${HAVEN_HA_CONFIG_DIR}/automations/haven/<slug>.yaml`, and calls
   `automation.reload` so it takes effect without an HA restart.

If `HAVEN_HA_CONFIG_DIR` is unset (e.g. the laptop), the file is still written
here and version-controlled; only the live sync + reload are skipped.

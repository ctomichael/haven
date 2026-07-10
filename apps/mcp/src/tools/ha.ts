import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { ACTOR } from '../schemas.ts';
import { BACKEND_URL, REPO_DIR, HA_CONFIG_DIR } from '../config.ts';
import { requireApproval } from '../approvals.ts';

// Home Assistant tools. Reads + service calls proxy the backend (which owns the
// HA bearer token + allowlists). Automation write/remove manage YAML files under
// ha/automations/haven/ in the repo, sync them onto HAOS, and reload.

async function backend(path: string, init?: { method?: string; body?: unknown }) {
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const err = new Error(`backend ${init?.method ?? 'GET'} ${path} → HTTP ${res.status}: ${text}`);
    (err as { code?: string }).code =
      (data.error as string) ?? (res.status === 503 ? 'not_configured' : 'backend_error');
    throw err;
  }
  return data;
}

// ----- reads -----------------------------------------------------------

export const haEntityStateSchema = {
  entity_id: z.string().min(1).describe('e.g. "climate.mitsubishi_heatpump".'),
  actor: ACTOR,
};
export async function haEntityState(args: { entity_id: string }) {
  const data = await backend(`/api/ha/entities?ids=${encodeURIComponent(args.entity_id)}`);
  const entities = (data.entities as unknown[]) ?? [];
  if (entities.length === 0) {
    const err = new Error(`entity ${args.entity_id} not found or not allowed`);
    (err as { code?: string }).code = 'not_found';
    throw err;
  }
  return entities[0];
}

export const haEntityHistorySchema = {
  entity_id: z.string().min(1),
  hours: z.number().int().min(1).max(168).default(24),
  actor: ACTOR,
};
export async function haEntityHistory(args: { entity_id: string; hours: number }) {
  return backend(`/api/ha/history?entity=${encodeURIComponent(args.entity_id)}&hours=${args.hours}`);
}

export const haEntitySearchSchema = {
  query: z.string().default('').describe('Substring of entity_id or friendly name.'),
  domain: z.string().optional().describe("Restrict to a domain, e.g. 'climate'."),
  actor: ACTOR,
};
export async function haEntitySearch(args: { query: string; domain?: string }) {
  const qs = new URLSearchParams({ q: args.query });
  if (args.domain) qs.set('domain', args.domain);
  return backend(`/api/ha/search?${qs.toString()}`);
}

// ----- ha_entity_call_service (gated) ----------------------------------

export const haEntityCallServiceSchema = {
  domain: z.string().min(1).describe("e.g. 'climate', 'light', 'switch'."),
  service: z.string().min(1).describe("e.g. 'turn_on', 'set_temperature'."),
  entity_id: z.string().optional(),
  data: z.record(z.unknown()).optional().describe('Extra service data (e.g. {temperature: 20}).'),
  approval_token: z.string().describe('Approval token for action_kind=ha_entity_call_service.'),
  actor: ACTOR,
};
export async function haEntityCallService(args: {
  domain: string;
  service: string;
  entity_id?: string;
  data?: Record<string, unknown>;
  approval_token: string;
}) {
  await requireApproval('ha_entity_call_service', args.approval_token);
  return backend('/api/ha/service', {
    method: 'POST',
    body: { domain: args.domain, service: args.service, entity_id: args.entity_id, data: args.data },
  });
}

// ----- automations: write / remove -------------------------------------

const AUTO_DIR = join(REPO_DIR, 'ha', 'automations', 'haven');

// Best-effort git commit of an automation file change. In prod (REPO_DIR is the
// live checkout) this version-controls the change; on the laptop / a non-git
// dir it no-ops with a warning.
function gitCommit(file: string, message: string): void {
  try {
    const add = spawnSync('git', ['-C', REPO_DIR, 'add', file], { encoding: 'utf8' });
    if (add.status !== 0) return;
    // --no-verify: this is agent-generated automation data, not a code change
    // Hermes needs to learn about, so it skips the CHANGELOG pre-commit hook.
    spawnSync('git', ['-C', REPO_DIR, 'commit', '--no-verify', '-m', message], {
      encoding: 'utf8',
    });
  } catch (e) {
    console.error(`[ha] git commit skipped: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// Copy the file onto HAOS if HAVEN_HA_CONFIG_DIR is set; else skip.
function syncToHaos(slug: string, sourcePath: string, remove: boolean): boolean {
  if (!HA_CONFIG_DIR) return false;
  const destDir = join(HA_CONFIG_DIR, 'automations', 'haven');
  const dest = join(destDir, `${slug}.yaml`);
  try {
    if (remove) {
      if (existsSync(dest)) rmSync(dest);
    } else {
      mkdirSync(destDir, { recursive: true });
      copyFileSync(sourcePath, dest);
    }
    return true;
  } catch (e) {
    console.error(`[ha] HAOS sync failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

async function reloadAutomations(): Promise<boolean> {
  try {
    await backend('/api/ha/service', {
      method: 'POST',
      body: { domain: 'automation', service: 'reload' },
    });
    return true;
  } catch (e) {
    console.error(`[ha] automation.reload failed: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}

export const haAutomationWriteSchema = {
  name: z.string().regex(/^[a-z][a-z0-9_]*$/, 'slug: lowercase, digits, underscores').describe('Automation slug.'),
  yaml_content: z.string().min(1).describe('The automation YAML (one automation).'),
  approval_token: z.string().describe('Approval token for action_kind=ha_automation_write.'),
  actor: ACTOR,
};
export async function haAutomationWrite(args: {
  name: string;
  yaml_content: string;
  approval_token: string;
}) {
  await requireApproval('ha_automation_write', args.approval_token);
  // Light sanity check — reject obviously-not-an-automation content. (Full YAML
  // validation happens when HA reloads; a bad file surfaces there.)
  if (!/trigger|action/i.test(args.yaml_content)) {
    const err = new Error('yaml_content does not look like an automation (no trigger/action)');
    (err as { code?: string }).code = 'invalid_args';
    throw err;
  }
  mkdirSync(AUTO_DIR, { recursive: true });
  const path = join(AUTO_DIR, `${args.name}.yaml`);
  writeFileSync(path, args.yaml_content.endsWith('\n') ? args.yaml_content : `${args.yaml_content}\n`);
  const sha = createHash('sha256').update(args.yaml_content).digest('hex').slice(0, 12);

  gitCommit(path, `automation: ${args.name} — ha_automation_write`);
  const synced = syncToHaos(args.name, path, false);
  const reloaded = synced ? await reloadAutomations() : false;
  return { path: `ha/automations/haven/${args.name}.yaml`, sha, synced, reloaded };
}

export const haAutomationRemoveSchema = {
  name: z.string().min(1).describe('Automation slug to remove.'),
  reason: z.string().min(1),
  approval_token: z.string().describe('Approval token for action_kind=ha_automation_remove.'),
  actor: ACTOR,
};
export async function haAutomationRemove(args: {
  name: string;
  reason: string;
  approval_token: string;
}) {
  await requireApproval('ha_automation_remove', args.approval_token);
  const path = join(AUTO_DIR, `${args.name}.yaml`);
  if (!existsSync(path)) {
    const err = new Error(`automation ${args.name} not found (only Haven-owned ones can be removed)`);
    (err as { code?: string }).code = 'not_found';
    throw err;
  }
  rmSync(path);
  gitCommit(path, `automation: remove ${args.name} — ${args.reason}`);
  const synced = syncToHaos(args.name, path, true);
  const reloaded = synced ? await reloadAutomations() : false;
  return { ok: true, name: args.name, synced, reloaded };
}

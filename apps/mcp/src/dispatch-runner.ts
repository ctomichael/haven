// Dispatch runner — the long-running half of widget_dispatch. Spawned detached
// (so it outlives the MCP call), it drives one agent_tasks row to completion:
// isolate a git worktree, run `claude -p` against the plan, verify + commit are
// clean, fast-forward main, push, and record the outcome. Never touches the
// live checkout, so a failed run can't break the deployed tree.
//
//   bun run apps/mcp/src/dispatch-runner.ts <task_id>
//
// This is a production (Beelink) code path — it needs the `claude` CLI
// authenticated and git push access. On failure it records a precise error on
// the task so Hermes (widget_dispatch_status) can report or re-plan.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { sql } from './client.ts';
import { asJson } from './jsonb.ts';
import { REPO_DIR, TASKS_DIR, DISPATCH_MODEL } from './config.ts';

const rawTaskId = process.argv[2];
if (!rawTaskId) {
  console.error('[dispatch-runner] usage: dispatch-runner.ts <task_id>');
  process.exit(1);
}
const taskId: string = rawTaskId;

type TaskRow = {
  id: string;
  kind: string;
  slug: string | null;
  plan: Record<string, unknown>;
  status: string;
};

function git(args: string[], cwd = REPO_DIR): { code: number; out: string } {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

async function fail(reason: string, detail?: unknown): Promise<never> {
  console.error(`[dispatch-runner] ${taskId} failed: ${reason}`);
  await sql`
    update agent_tasks
    set status = 'failed', error = ${asJson({ reason, detail: detail ?? null })}, finished_at = now()
    where id = ${taskId}
  `;
  await sql.end({ timeout: 5 });
  process.exit(1);
}

async function main(): Promise<void> {
  const [task] = await sql<TaskRow[]>`select * from agent_tasks where id = ${taskId}`;
  if (!task) {
    console.error(`[dispatch-runner] task ${taskId} not found`);
    await sql.end({ timeout: 5 });
    process.exit(1);
  }

  const taskDir = join(TASKS_DIR, taskId);
  const worktree = join(taskDir, 'wt');
  const branch = `dispatch/${taskId.slice(0, 8)}`;
  mkdirSync(taskDir, { recursive: true });
  writeFileSync(join(taskDir, 'plan.json'), JSON.stringify(task.plan, null, 2));

  await sql`
    update agent_tasks set status = 'running', branch = ${branch}, started_at = now(),
      log_path = ${join(taskDir, 'run.log')} where id = ${taskId}
  `;

  // 1. Fresh worktree off the current main.
  git(['worktree', 'remove', '--force', worktree]); // clear any stale one
  const base = git(['rev-parse', 'HEAD']).out.trim();
  const wt = git(['worktree', 'add', '-b', branch, worktree, base]);
  if (wt.code !== 0) await fail('worktree add failed', wt.out);

  try {
    // 2. Run claude -p against the plan, output teed to run.log.
    const prompt =
      `You are executing a dispatched Haven plan. Read docs/agent-dispatch.md first, ` +
      `then ${join(taskDir, 'plan.json')}, then execute the plan exactly. ` +
      `Write ${join(taskDir, 'result.json')} when done.`;
    const claude = spawnSync(
      'claude',
      ['-p', prompt, '--model', DISPATCH_MODEL, '--permission-mode', 'acceptEdits', '--max-turns', '80'],
      { cwd: worktree, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
    );
    writeFileSync(join(taskDir, 'run.log'), `${claude.stdout ?? ''}${claude.stderr ?? ''}`);
    if (claude.error) await fail('claude spawn failed (is the CLI installed + authed?)', String(claude.error));

    // 3. Read the session's structured result, if it wrote one.
    const resultPath = join(taskDir, 'result.json');
    let result: { status?: string; commit?: string; summary?: string; error?: { code?: string } } = {};
    if (existsSync(resultPath)) {
      try {
        result = JSON.parse(readFileSync(resultPath, 'utf8'));
      } catch {
        /* leave result empty → treated as a failure below */
      }
    }

    // 4. Did it commit? Verify there's a new commit on the branch.
    const head = git(['rev-parse', 'HEAD'], worktree).out.trim();
    const committed = head !== base && head.length > 0;
    if (result.error?.code || !committed) {
      await fail(result.error?.code ? `plan reported ${result.error.code}` : 'no commit produced', {
        result,
        tail: (claude.stdout ?? '').slice(-2000),
      });
    }

    // 5. Fast-forward main to the new commit and push.
    const ff = git(['merge', '--ff-only', branch]); // in REPO_DIR (main)
    if (ff.code !== 0) await fail('fast-forward of main failed (main advanced?)', ff.out);
    const push = git(['push', 'origin', 'HEAD:main']);
    if (push.code !== 0) {
      // Not fatal to the widget itself (it's on main locally); surface it.
      console.error(`[dispatch-runner] push failed: ${push.out}`);
    }

    await sql`
      update agent_tasks
      set status = 'succeeded', commit_sha = ${head}, finished_at = now(),
          error = ${push.code !== 0 ? asJson({ warning: 'push_failed', detail: push.out }) : null}
      where id = ${taskId}
    `;
    console.error(`[dispatch-runner] ${taskId} succeeded → ${head}`);
  } finally {
    git(['worktree', 'remove', '--force', worktree]);
    git(['branch', '-D', branch]);
  }

  await sql.end({ timeout: 5 });
  process.exit(0);
}

main().catch(async (e) => {
  await fail('runner exception', e instanceof Error ? e.message : String(e));
});

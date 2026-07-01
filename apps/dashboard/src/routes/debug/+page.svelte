<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  type Health = {
    ok: boolean;
    service: string;
    version: string;
    started_at: string;
    now: string;
    db: { ok: boolean; latency_ms?: number; error?: string };
    migrations: {
      applied: string[];
      pending: string[];
      skipped: Array<{ name: string; reason: string }>;
      last_applied: string | null;
      error?: string;
    };
    squawk: { available: boolean };
  } | null;

  let health = $state<Health>(null);
  let healthError = $state<string | null>(null);
  let lastHeartbeat = $state<string | null>(null);
  let sseStatus = $state<'connecting' | 'open' | 'closed' | 'error'>('connecting');
  let helloPayload = $state<string | null>(null);
  let es: EventSource | undefined;

  async function fetchHealth() {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      health = (await res.json()) as Health;
      healthError = null;
    } catch (e) {
      healthError = e instanceof Error ? e.message : String(e);
      health = null;
    }
  }

  onMount(() => {
    fetchHealth();
    const healthInterval = setInterval(fetchHealth, 5000);

    es = new EventSource('/api/events');
    es.addEventListener('open', () => (sseStatus = 'open'));
    es.addEventListener('error', () => (sseStatus = 'error'));
    es.addEventListener('hello', (e) => (helloPayload = e.data));
    es.addEventListener('heartbeat', (e) => {
      const parsed = JSON.parse(e.data) as { ts: string };
      lastHeartbeat = parsed.ts;
    });

    return () => clearInterval(healthInterval);
  });

  onDestroy(() => {
    es?.close();
    sseStatus = 'closed';
  });
</script>

<main>
  <header>
    <h1>System</h1>
    <p class="sub">Backend health, DB, migrations, SSE</p>
  </header>

  <section class="grid">
    <article class="tile">
      <h2>Backend</h2>
      {#if healthError}
        <p class="err">error: {healthError}</p>
      {:else if health}
        <dl>
          <dt>overall</dt><dd>{health.ok ? 'ok' : 'degraded'}</dd>
          <dt>service</dt><dd>{health.service}</dd>
          <dt>version</dt><dd>{health.version}</dd>
          <dt>started</dt><dd>{health.started_at}</dd>
        </dl>
      {:else}
        <p>loading…</p>
      {/if}
    </article>

    <article class="tile">
      <h2>Database</h2>
      {#if health}
        <dl>
          <dt>ping</dt>
          <dd>{health.db.ok ? `ok (${health.db.latency_ms} ms)` : `down — ${health.db.error ?? '?'}`}</dd>
          <dt>applied</dt>
          <dd>{health.migrations.last_applied ?? '—'} ({health.migrations.applied.length})</dd>
          <dt>pending</dt>
          <dd>{health.migrations.pending.length === 0 ? '0' : health.migrations.pending.join(', ')}</dd>
          {#if health.migrations.skipped.length}
            <dt>skipped</dt>
            <dd>
              {#each health.migrations.skipped as s}
                <div>{s.name}: {s.reason}</div>
              {/each}
            </dd>
          {/if}
          <dt>squawk</dt>
          <dd>{health.squawk.available ? 'available' : 'missing'}</dd>
        </dl>
      {:else}
        <p>loading…</p>
      {/if}
    </article>

    <article class="tile">
      <h2>SSE stream</h2>
      <dl>
        <dt>status</dt><dd>{sseStatus}</dd>
        <dt>hello</dt><dd>{helloPayload ?? '—'}</dd>
        <dt>last heartbeat</dt>
        <dd>{lastHeartbeat ?? '—'}</dd>
      </dl>
    </article>
  </section>
</main>

<style>
  main {
    max-width: 1100px;
    margin: 0 auto;
    padding: 40px 28px;
  }
  header { margin-bottom: 24px; }
  h1 {
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 44px;
    margin: 0;
  }
  .sub {
    margin: 4px 0 0;
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: 15px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 20px;
  }
  .tile {
    border-top: var(--border-normal) solid var(--ink);
    padding: 16px 0 0;
  }
  h2 {
    font-family: var(--font-sans);
    font-weight: 600;
    font-size: 16px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    margin: 0 0 16px;
  }
  dl {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 6px 16px;
    margin: 0;
    font-variant-numeric: tabular-nums;
  }
  dt {
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-size: 15px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }
  dd {
    margin: 0;
    font-size: 18px;
    word-break: break-all;
  }
  .err { color: #b00; }
  @media (max-width: 800px) {
    .grid { grid-template-columns: 1fr; }
  }
</style>

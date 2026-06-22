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
    <h1>Haven</h1>
    <p class="sub">Household dashboard — scaffold check</p>
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
          <dt>started</dt><dd><time datetime={health.started_at}>{health.started_at}</time></dd>
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

  <footer>
    <p>If overall is ok, the heartbeat ticks, and pending = 0, the scaffold is healthy end-to-end.</p>
  </footer>
</main>

<style>
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 48px 32px;
  }
  header { margin-bottom: 32px; }
  h1 {
    font-size: 60px;
    font-weight: 500;
    letter-spacing: -0.02em;
    margin: 0;
  }
  .sub {
    margin: 4px 0 0;
    color: var(--ink-2);
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 24px;
  }
  @media (max-width: 900px) {
    .grid { grid-template-columns: 1fr 1fr; }
  }
  .tile {
    border: 2px solid var(--ink);
    padding: 24px;
    background: var(--paper);
  }
  h2 {
    font-size: 24px;
    margin: 0 0 16px;
    font-weight: 500;
    border-bottom: 1px solid var(--ink-2);
    padding-bottom: 8px;
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
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  dd {
    margin: 0;
    font-size: 18px;
    word-break: break-all;
  }
  footer {
    margin-top: 32px;
    color: var(--ink-2);
    font-size: 14px;
  }
  .err { color: #b00; }
  @media (max-width: 700px) {
    .grid { grid-template-columns: 1fr; }
    h1 { font-size: 44px; }
  }
</style>

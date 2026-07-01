<script lang="ts">
  import Modal from './Modal.svelte';
  import TempChart from './TempChart.svelte';
  import { fetchHaHistory, type HaHistory } from '$lib/api';

  let {
    entity,
    label,
    unit = '°C',
    onClose,
  }: { entity: string; label: string; unit?: string; onClose: () => void } = $props();

  const RANGES = [
    { hours: 24, label: '24h' },
    { hours: 72, label: '3d' },
    { hours: 168, label: '7d' },
  ];

  let hours = $state(24);
  let status = $state<'loading' | 'ok' | 'error'>('loading');
  let history = $state<HaHistory | null>(null);

  // Re-fetch whenever the entity or the selected range changes.
  $effect(() => {
    const e = entity;
    const h = hours;
    status = 'loading';
    fetchHaHistory(e, h)
      .then((d) => {
        history = d;
        status = 'ok';
      })
      .catch(() => {
        status = 'error';
      });
  });

  const fmt = (v: number | null | undefined) =>
    v == null ? '—' : `${v.toFixed(1)}${history?.unit ?? unit}`;
  let current = $derived(history?.points.at(-1)?.v ?? null);
</script>

<Modal title={label} {onClose}>
  <div class="ranges">
    {#each RANGES as r (r.hours)}
      <button class="range" class:sel={hours === r.hours} onclick={() => (hours = r.hours)}>
        {r.label}
      </button>
    {/each}
  </div>

  {#if status === 'loading'}
    <p class="msg">Loading history…</p>
  {:else if status === 'error'}
    <p class="msg">Couldn’t load history.</p>
  {:else if history && history.points.length >= 2}
    <TempChart points={history.points} unit={history.unit ?? unit} />
    <div class="stats">
      <div class="stat"><span class="k">Now</span><span class="v">{fmt(current)}</span></div>
      <div class="stat"><span class="k">Low</span><span class="v">{fmt(history.min)}</span></div>
      <div class="stat"><span class="k">High</span><span class="v">{fmt(history.max)}</span></div>
    </div>
  {:else}
    <p class="msg">No history in this range.</p>
  {/if}
</Modal>

<style>
  .ranges {
    display: inline-flex;
    gap: 8px;
    margin-bottom: 16px;
  }
  .range {
    border: var(--border-normal) solid var(--hairline);
    background: var(--paper);
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.1em;
    padding: 6px 14px;
  }
  .range.sel {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
  .msg {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.16em;
    color: var(--muted-mono);
    text-transform: uppercase;
    padding: 32px 0;
    text-align: center;
  }
  .stats {
    display: flex;
    gap: 40px;
    margin-top: 18px;
    padding-top: 16px;
    border-top: var(--border-thin) solid var(--hairline);
  }
  .stat {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .stat .k {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: var(--muted-mono);
  }
  .stat .v {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 26px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
</style>

<script lang="ts">
  import WidgetFrame from './WidgetFrame.svelte';

  let {
    data,
    labels,
    highlightIndex,
    unit = 'h',
    title = 'Heat pump runtime',
    meta = 'LAST 7 DAYS',
  }: {
    data: number[];
    labels: string[];
    highlightIndex?: number;
    unit?: string;
    title?: string;
    meta?: string;
  } = $props();

  // Baseline heights off the weekly average rather than zero, so a run of
  // similar-but-not-equal values reads as a varied bar chart instead of a
  // flat band near the top. Mean → mid-height; the day furthest from the
  // mean hits the extreme.
  let mean = $derived(data.length ? data.reduce((a, b) => a + b, 0) / data.length : 0);
  let maxDev = $derived(Math.max(...data.map((v) => Math.abs(v - mean)), 0.001));

  function heightPct(v: number): number {
    const pct = 50 + ((v - mean) / maxDev) * 46;
    return Math.min(100, Math.max(8, pct));
  }
</script>

<WidgetFrame {title} {meta}>
  <div class="bars">
    {#each data as v, i (i)}
      <div class="col">
        <span class="val">{v.toFixed(1)}{unit}</span>
        <div class="bar-wrap">
          <div
            class="bar"
            class:today={i === highlightIndex}
            style="--h: {heightPct(v)}%"
          ></div>
        </div>
        <span class="day">{labels[i]}</span>
      </div>
    {/each}
  </div>
</WidgetFrame>

<style>
  .bars {
    flex: 1;
    /* Guarantee vertical room even when the frame is content-height, so the
       bars can actually show their relative heights. Grows to fill taller
       cells too. */
    min-height: 130px;
    display: grid;
    grid-template-columns: repeat(var(--cols, 7), 1fr);
    gap: 8px;
    align-content: stretch;
  }
  .col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 0;
  }
  .val {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .bar-wrap {
    flex: 1;
    width: 100%;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    min-height: 0;
  }
  .bar {
    width: 32px;
    height: var(--h);
    min-height: 4px;
    border: var(--border-normal) solid var(--ink);
    background: var(--accent-sage-tint);
  }
  .bar.today {
    background: var(--ink);
  }
  .day {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    color: var(--ink);
    letter-spacing: 0.1em;
  }
</style>

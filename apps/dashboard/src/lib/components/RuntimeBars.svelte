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

  let max = $derived(Math.max(...data, 0.001));
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
            style="--h: {Math.max(4, (v / max) * 100)}%"
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
    min-height: 0;
    display: grid;
    grid-template-columns: repeat(var(--cols, 7), 1fr);
    gap: 8px;
  }
  .col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-width: 0;
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

<script lang="ts">
  import WidgetFrame from './WidgetFrame.svelte';
  import type { SleepSack } from '$lib/dummy';

  let { sack }: { sack: SleepSack } = $props();
</script>

<WidgetFrame title="Sleep sack" meta={`TONIGHT · ${sack.child.toUpperCase()}`}>
  <div class="tog-block">
    <span class="tog">{sack.tog}</span>
    <span class="unit">TOG</span>
  </div>
  <div class="layer">{sack.extraLayer}</div>
  <div class="meta">ROOM LOW ~{sack.roomLow}° OVERNIGHT</div>
</WidgetFrame>

<style>
  .tog-block {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .tog {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 52px;
    line-height: 0.9;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .unit {
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 18px;
    letter-spacing: 0.22em;
    color: var(--ink);
  }
  .layer {
    margin-top: 12px;
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 22px;
    color: var(--ink);
  }
  .meta {
    margin-top: auto;
    padding-top: 16px;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0.2em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
</style>

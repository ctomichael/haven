<script lang="ts">
  import WidgetFrame from './WidgetFrame.svelte';
  import AccentChip from './AccentChip.svelte';
  import type { Sensor } from '$lib/dummy';

  let { sensor }: { sensor: Sensor } = $props();
</script>

<WidgetFrame title={sensor.label} live>
  <div class="row">
    <span class="value">{sensor.value}</span>
    <span class="unit">{sensor.unit}</span>
  </div>
  {#if sensor.state === 'warn' && sensor.warnText}
    <div class="chip-wrap">
      <AccentChip accent="amber" label={sensor.warnText} />
    </div>
  {/if}
</WidgetFrame>

<style>
  .row {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .value {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 64px;
    line-height: 0.9;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .unit {
    font-family: var(--font-serif);
    font-size: 28px;
    color: var(--ink);
  }
  .chip-wrap {
    margin-top: 12px;
  }
</style>

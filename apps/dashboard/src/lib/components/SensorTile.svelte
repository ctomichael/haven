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
  <div class="sub-row">
    <span class="sub">Indoor temp</span>
    {#if sensor.state === 'warn' && sensor.warnText}
      <AccentChip accent="amber" label={sensor.warnText} />
    {/if}
  </div>
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
    font-size: 52px;
    line-height: 0.9;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .unit {
    font-family: var(--font-serif);
    font-size: 24px;
    color: var(--ink);
  }
  .sub-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
  }
  .sub {
    font-family: var(--font-mono);
    font-size: 12px;
    letter-spacing: 0.18em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
</style>

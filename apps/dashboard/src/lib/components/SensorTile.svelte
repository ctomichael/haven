<script lang="ts">
  import WidgetFrame from './WidgetFrame.svelte';
  import AccentChip from './AccentChip.svelte';
  import type { Sensor } from '$lib/dummy';

  let { sensor, onOpen }: { sensor: Sensor; onOpen?: () => void } = $props();
</script>

{#snippet body()}
  <WidgetFrame title={sensor.label} live>
    <div class="row">
      <span class="value">{sensor.value}</span>
      <span class="unit">{sensor.unit}</span>
      {#if sensor.state === 'warn' && sensor.warnText}
        <span class="chip-wrap">
          <AccentChip accent="amber" label={sensor.warnText} />
        </span>
      {/if}
    </div>
    <div class="sub">Indoor temp</div>
  </WidgetFrame>
{/snippet}

{#if onOpen}
  <button class="tile tappable" type="button" onclick={onOpen}>{@render body()}</button>
{:else}
  <div class="tile">{@render body()}</div>
{/if}

<style>
  .tile {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
  }
  .tile.tappable {
    cursor: pointer;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .value {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 52px;
    line-height: 0.9;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .unit {
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 24px;
    color: var(--ink);
  }
  .chip-wrap {
    margin-left: auto;
  }
  .sub {
    margin-top: 8px;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.18em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
</style>

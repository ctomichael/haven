<script lang="ts">
  import { Flame } from 'lucide-svelte';
  import WidgetFrame from './WidgetFrame.svelte';
  import Sparkline from './Sparkline.svelte';
  import type { Climate } from '$lib/dummy';

  let { climate, onOpen }: { climate: Climate; onOpen?: () => void } = $props();

  let heating = $derived(climate.mode === 'heat' && climate.current < climate.target);
</script>

<WidgetFrame title="Climate" live meta="LIVING ROOM" action onAction={onOpen}>
  <div class="top">
    <div class="value-block">
      <span class="value">{climate.current}</span>
      <span class="unit">°C</span>
    </div>
    {#if heating}
      <span class="heating-chip">
        <Flame size={20} strokeWidth={2.5} />
        HEATING → {climate.target}°
      </span>
    {/if}
  </div>

  <div class="mode">MODE · {climate.mode.toUpperCase()}</div>

  <div class="spark-wrap">
    <Sparkline data={climate.sparkline24h} height={70} />
    <div class="spark-meta">
      <span>00:00</span>
      <span>{climate.status}</span>
      <span>NOW</span>
    </div>
  </div>

  <span class="tap">Tap for controls</span>
</WidgetFrame>

<style>
  .top {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
  }
  .value-block {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .value {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 74px;
    line-height: 0.9;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .unit {
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 28px;
    color: var(--ink);
  }
  .heating-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    background: var(--accent-rust-tint);
    color: var(--ink);
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .mode {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.22em;
    color: var(--muted-mono);
    text-transform: uppercase;
    margin-top: 4px;
  }
  .spark-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 8px;
  }
  .spark-meta {
    display: flex;
    justify-content: space-between;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 11px;
    letter-spacing: 0.2em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
  .tap {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.22em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
</style>

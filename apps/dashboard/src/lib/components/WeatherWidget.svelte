<script lang="ts">
  import { Sun } from 'lucide-svelte';
  import WidgetFrame from './WidgetFrame.svelte';
  import type { ForecastDay } from '$lib/dummy';

  let {
    city,
    currentTemp,
    currentLabel,
    forecast,
  }: {
    city: string;
    currentTemp: number;
    currentLabel: string;
    forecast: ForecastDay[];
  } = $props();
</script>

<WidgetFrame title="Weather" live meta={city}>
  <div class="row">
    <div class="now">
      <div class="now-top">
        <Sun size={48} strokeWidth={2} />
        <span class="big-temp">{currentTemp}°</span>
      </div>
      <span class="label">{currentLabel}</span>
    </div>
    <div class="forecast">
      {#each forecast as d (d.day)}
        <div class="day">
          <span class="dow">{d.day}</span>
          <span class="hi-lo">
            <span>{d.high}°</span><span class="lo"> / {d.low}°</span>
          </span>
          <span class="cond">{d.label}</span>
        </div>
      {/each}
    </div>
  </div>
</WidgetFrame>

<style>
  .row {
    flex: 1;
    display: flex;
    align-items: stretch;
    gap: 0;
  }
  .now {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-right: 28px;
    border-right: var(--border-normal) solid var(--ink);
  }
  .now-top {
    display: flex;
    align-items: center;
    gap: 22px;
  }
  .big-temp {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 64px;
    line-height: 0.9;
    letter-spacing: -0.02em;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .label {
    font-family: var(--font-serif);
    font-size: 24px;
    color: var(--ink);
  }
  .forecast {
    flex: 1;
    display: flex;
    gap: 0;
    padding-left: 28px;
  }
  .day {
    flex: 1;
    padding: 0 0 0 22px;
    display: flex;
    flex-direction: column;
    gap: 9px;
    border-left: var(--border-normal) solid var(--hairline-2);
  }
  .day:first-child {
    border-left: 0;
    padding-left: 0;
  }
  .dow {
    font-family: var(--font-mono);
    font-size: 13px;
    letter-spacing: 0.2em;
    color: var(--ink);
  }
  .hi-lo {
    font-family: var(--font-mono);
    font-size: 24px;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .lo {
    color: var(--muted-mono);
  }
  .cond {
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--ink-2);
  }
</style>

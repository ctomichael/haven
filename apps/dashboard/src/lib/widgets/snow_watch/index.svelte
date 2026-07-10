<script lang="ts">
  import { onMount } from 'svelte';
  import { Snowflake } from 'lucide-svelte';
  import WidgetFrame from '$lib/components/WidgetFrame.svelte';
  import { load, type SnowDay } from './data';

  // Reference widget for the dispatch pipeline (P5). Self-loads via its data.ts
  // (which uses $lib/repos/*), composes WidgetFrame + existing tokens — the
  // canonical shape a dispatched claude -p session imitates.

  let days = $state<SnowDay[]>([]);
  let loaded = $state(false);

  onMount(async () => {
    ({ days } = await load(fetch));
    loaded = true;
  });
</script>

<WidgetFrame title="Snow watch" meta={loaded ? String(days.length) : ''}>
  {#if days.length > 0}
    <ul class="days">
      {#each days as d (d.day)}
        <li class="day">
          <Snowflake size={20} strokeWidth={2} />
          <span class="name">{d.day}</span>
          <span class="when">{d.when.join(' · ')}</span>
          <span class="temp">{d.high}° / {d.low}°</span>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="empty">{loaded ? 'No snow in the forecast.' : '…'}</p>
  {/if}
</WidgetFrame>

<style>
  .days {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .day {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-sans);
    font-size: 18px;
    color: var(--ink);
  }
  .name {
    font-weight: 700;
    letter-spacing: 0.06em;
    min-width: 48px;
  }
  .when {
    flex: 1;
    color: var(--ink-2);
    text-transform: capitalize;
  }
  .temp {
    font-family: var(--font-mono);
    font-variant-numeric: tabular-nums;
  }
  .empty {
    font-family: var(--font-sans);
    font-size: 16px;
    color: var(--ink-2);
    margin: 0;
  }
</style>

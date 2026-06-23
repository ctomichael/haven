<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import WidgetFrame from './WidgetFrame.svelte';
  import AccentDot from './AccentDot.svelte';
  import type { CalendarEvent } from '$lib/dummy';

  let {
    events,
    onOpen,
  }: { events: CalendarEvent[]; onOpen?: () => void } = $props();

  let now = $state(new Date());
  let timer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    timer = setInterval(() => (now = new Date()), 60_000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  let metaDate = $derived(
    now
      .toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'long' })
      .toUpperCase(),
  );
</script>

<WidgetFrame title="Today" meta={metaDate} action onAction={onOpen}>
  <ul class="list">
    {#each events as e (e.id)}
      <li class="row" class:past={e.past} class:next={e.isNext}>
        {#if e.isNext}<span class="next-bar" aria-hidden="true"></span>{/if}
        <span class="time">{e.start}</span>
        <span class="dot-wrap"><AccentDot accent={e.accent} size={10} /></span>
        <span class="title-sub">
          <span class="title">{e.title}</span>
          {#if e.sub}<span class="sub">{e.sub}</span>{/if}
        </span>
        {#if e.isNext}
          <span class="next-chip">UP NEXT</span>
        {/if}
      </li>
    {/each}
  </ul>
</WidgetFrame>

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .row {
    display: grid;
    grid-template-columns: 62px 18px 1fr auto;
    align-items: baseline;
    gap: 12px;
    position: relative;
    padding-left: 8px;
  }
  .next .next-bar {
    position: absolute;
    left: 0;
    top: 2px;
    bottom: 2px;
    width: 4px;
    background: var(--accent-amber);
  }
  .past {
    opacity: 0.5;
  }
  .past .title,
  .past .sub {
    text-decoration: line-through;
  }
  .time {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 20px;
    color: var(--ink);
  }
  .dot-wrap {
    display: inline-flex;
    align-items: center;
  }
  .title-sub {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .title {
    font-family: var(--font-sans);
    font-weight: 500;
    font-size: 20px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sub {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 12px;
    letter-spacing: 0.18em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
  .next-chip {
    background: var(--accent-amber-tint);
    color: var(--ink);
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.18em;
    padding: 4px 8px;
  }
</style>

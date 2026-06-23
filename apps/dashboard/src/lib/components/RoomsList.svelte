<script lang="ts">
  import { untrack } from 'svelte';
  import WidgetFrame from './WidgetFrame.svelte';
  import Switch from './Switch.svelte';
  import type { Room } from '$lib/dummy';

  let { rooms: initialRooms }: { rooms: Room[] } = $props();

  let rooms: Room[] = $state(untrack(() => [...initialRooms]));

  function toggle(id: string) {
    rooms = rooms.map((r) => (r.id === id ? { ...r, on: !r.on } : r));
  }
</script>

<WidgetFrame title="Rooms">
  <ul class="list">
    {#each rooms as r (r.id)}
      <li>
        <span class="name">{r.name}</span>
        <span class="temp"><span class="value">{r.temp}</span><span class="unit">°</span></span>
        <Switch on={r.on} onchange={() => toggle(r.id)} label={`Toggle ${r.name}`} />
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
    gap: 4px;
  }
  .list li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    align-items: center;
    gap: 18px;
    padding: 10px 0;
    border-bottom: var(--border-thin) solid var(--hairline);
  }
  .list li:last-child {
    border-bottom: 0;
  }
  .name {
    font-family: var(--font-sans);
    font-weight: 500;
    font-size: 20px;
    color: var(--ink);
  }
  .temp {
    display: inline-flex;
    align-items: baseline;
    gap: 2px;
  }
  .value {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 22px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .unit {
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 16px;
    color: var(--ink);
  }
</style>

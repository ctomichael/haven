<script lang="ts">
  import WidgetFrame from './WidgetFrame.svelte';

  export type RoomTemp = { label: string; value: number | null; unit: string };

  let { rooms, title = 'Rooms' }: { rooms: RoomTemp[]; title?: string } = $props();
</script>

<WidgetFrame {title} live>
  <ul class="list">
    {#each rooms as r (r.label)}
      <li>
        <span class="name">{r.label}</span>
        {#if r.value === null}
          <span class="nodata">—</span>
        {:else}
          <span class="temp"><span class="value">{r.value}</span><span class="unit">{r.unit}</span></span>
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
    gap: 4px;
  }
  .list li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 18px;
    padding: 12px 0;
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
    font-size: 24px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .unit {
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 16px;
    color: var(--ink);
  }
  .nodata {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 22px;
    color: var(--muted-mono);
  }
</style>

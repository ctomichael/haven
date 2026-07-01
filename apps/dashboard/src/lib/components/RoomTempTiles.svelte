<script lang="ts">
  import Sparkline from './Sparkline.svelte';

  export type RoomTile = {
    label: string;
    value: number | null;
    unit: string;
    history: number[];
  };

  let { rooms }: { rooms: RoomTile[] } = $props();
</script>

<div class="grid">
  {#each rooms as r (r.label)}
    <div class="tile">
      <div class="spark">
        {#if r.history.length >= 2}
          <Sparkline data={r.history} fill />
        {/if}
      </div>
      <div class="foot">
        <span class="name">{r.label}</span>
        <span class="temp">
          {#if r.value === null}
            <span class="nodata">—</span>
          {:else}
            {r.value}<span class="unit">{r.unit}</span>
          {/if}
        </span>
      </div>
    </div>
  {/each}
</div>

<style>
  .grid {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-auto-rows: 1fr;
    gap: 14px;
  }
  .tile {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 10px;
    min-height: 0;
    padding: 14px 16px;
    border: var(--border-normal) solid var(--ink);
    box-sizing: border-box;
  }
  .spark {
    flex: 1;
    min-height: 0;
    color: var(--ink);
  }
  .foot {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
  }
  .name {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 15px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--muted-mono);
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .temp {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 30px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    flex: 0 0 auto;
  }
  .unit {
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 18px;
  }
  .nodata {
    color: var(--muted-mono);
  }
</style>

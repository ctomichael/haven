<script lang="ts">
  import WidgetFrame from './WidgetFrame.svelte';
  import type { ShoppingItem } from '$lib/dummy';

  let {
    items,
    moreCount = 0,
    onOpen,
  }: { items: ShoppingItem[]; moreCount?: number; onOpen?: () => void } = $props();

  let total = $derived(items.length + moreCount);
  let meta = $derived(`${total} ITEMS`);
</script>

<WidgetFrame title="Shopping" {meta} action onAction={onOpen}>
  <ul class="list">
    {#each items as s (s.id)}
      <li class="row">
        <span class="dot" aria-hidden="true"></span>
        <span class="name">{s.name}</span>
        {#if s.qty}<span class="qty">{s.qty}</span>{/if}
      </li>
    {/each}
    {#if moreCount > 0}
      <li class="more">+{moreCount} more</li>
    {/if}
  </ul>
</WidgetFrame>

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: grid;
    grid-template-columns: 16px 1fr auto;
    align-items: baseline;
    gap: 12px;
  }
  .dot {
    width: 8px;
    height: 8px;
    background: var(--ink);
    border-radius: 50%;
    display: inline-block;
  }
  .name {
    font-family: var(--font-sans);
    font-weight: 500;
    font-size: 20px;
    color: var(--ink);
  }
  .qty {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 18px;
    color: var(--muted-mono);
    font-variant-numeric: tabular-nums;
  }
  .more {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.18em;
    color: var(--muted-mono);
    text-transform: uppercase;
    margin-top: 4px;
  }
</style>

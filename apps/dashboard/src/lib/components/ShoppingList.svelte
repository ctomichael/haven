<script lang="ts">
  import WidgetFrame from './WidgetFrame.svelte';
  import type { ApiShoppingItem } from '$lib/api';

  /**
   * Stateless dashboard shopping widget. Renders the visible slice; the
   * parent passes the overall total for the meta line and a moreCount for
   * the "+N more" footer.
   */
  let {
    items,
    total,
    moreCount = 0,
    onOpen,
  }: {
    items: ApiShoppingItem[];
    total?: number;
    moreCount?: number;
    onOpen?: () => void;
  } = $props();

  let totalCount = $derived(total ?? items.length + moreCount);
  let meta = $derived(`${totalCount} ITEMS`);
</script>

<WidgetFrame title="Shopping" {meta} action onAction={onOpen}>
  <ul class="list">
    {#each items as s (s.id)}
      <li>
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
  li {
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
    display: block;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.18em;
    color: var(--muted-mono);
    text-transform: uppercase;
    margin-top: 4px;
  }
</style>

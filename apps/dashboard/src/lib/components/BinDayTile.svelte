<script lang="ts">
  import { Trash2 } from 'lucide-svelte';
  import WidgetFrame from './WidgetFrame.svelte';
  import type { BinDay } from '$lib/dummy';

  let { binDay }: { binDay: BinDay } = $props();
</script>

{#if binDay.visible}
  <WidgetFrame title="Bin day">
    <div class="head">
      <Trash2 size={28} strokeWidth={2.5} />
      <span class="when">{binDay.whenLabel}</span>
    </div>
    <ul class="bins">
      {#each binDay.bins as b (b.label)}
        <li>
          <span class="square" style="--c: var(--accent-{b.accent})" aria-hidden="true"></span>
          <span class="label">{b.label}</span>
        </li>
      {/each}
    </ul>
    <div class="meta">{binDay.collectedLabel.toUpperCase()}</div>
  </WidgetFrame>
{/if}

<style>
  .head {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .when {
    font-family: var(--font-serif);
    font-weight: 600;
    font-size: 26px;
    color: var(--ink);
  }
  .bins {
    list-style: none;
    margin: 16px 0 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .bins li {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .square {
    width: 22px;
    height: 22px;
    background: var(--c);
    border: var(--border-normal) solid var(--ink);
    display: inline-block;
  }
  .label {
    font-family: var(--font-sans);
    font-weight: 600;
    font-size: 18px;
    color: var(--ink);
  }
  .meta {
    margin-top: auto;
    padding-top: 16px;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.2em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
</style>

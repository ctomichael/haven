<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ChevronRight } from 'lucide-svelte';

  let {
    title,
    live = false,
    action = false,
    onAction,
    children,
  }: {
    title: string;
    live?: boolean;
    action?: boolean;
    onAction?: () => void;
    children: Snippet;
  } = $props();
</script>

<section class="frame">
  <header>
    {#if action}
      <button class="title title-button" onclick={onAction}>
        {title}<ChevronRight size={16} strokeWidth={2.5} />
      </button>
    {:else}
      <span class="title">{title}</span>
    {/if}
    {#if live}
      <span class="live-pill">
        <span class="live-dot" aria-hidden="true"></span>
        LIVE
      </span>
    {/if}
  </header>
  <div class="body">
    {@render children()}
  </div>
</section>

<style>
  .frame {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding-top: 16px;
    border-top: var(--border-normal) solid var(--ink);
    min-height: 0;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .title {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-family: var(--font-sans);
    font-weight: 600;
    font-size: 14px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink);
  }
  .title-button {
    cursor: pointer;
  }

  .live-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: var(--font-mono);
    font-size: 11px;
    letter-spacing: 0.2em;
    color: var(--ink);
  }
  .live-dot {
    width: 7px;
    height: 7px;
    background: var(--ink);
    display: inline-block;
  }

  .body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>

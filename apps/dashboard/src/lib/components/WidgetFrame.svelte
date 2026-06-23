<script lang="ts">
  import type { Snippet } from 'svelte';
  import { ChevronRight } from 'lucide-svelte';

  let {
    title,
    live = false,
    meta,
    action = false,
    onAction,
    children,
  }: {
    title: string;
    live?: boolean;
    meta?: string;
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
    <span class="header-right">
      {#if meta}
        <span class="meta">{meta}</span>
      {/if}
      {#if live}
        <span class="live-pill">
          <span class="live-dot" aria-hidden="true"></span>
          LIVE
        </span>
      {/if}
    </span>
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
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink);
  }
  .title-button {
    cursor: pointer;
  }

  .header-right {
    display: inline-flex;
    align-items: center;
    gap: 14px;
  }
  .meta {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 13px;
    letter-spacing: 0.18em;
    color: var(--ink);
    text-transform: uppercase;
  }
  .live-pill {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font-family: var(--font-mono);
    font-weight: 500;
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

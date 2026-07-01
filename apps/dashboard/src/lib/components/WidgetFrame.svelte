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

  // The whole frame becomes the tappable target when `action` is set.
  // Inner controls (Checkbox, Switch, etc.) must stopPropagation in
  // their onclick so their taps don't bubble up and trigger navigation.
  function handleClick() {
    if (action && onAction) onAction();
  }
  function handleKey(e: KeyboardEvent) {
    if (!action || !onAction) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onAction();
    }
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<section
  class="frame"
  class:tappable={action}
  role={action ? 'button' : null}
  tabindex={action ? 0 : null}
  aria-label={action ? `Open ${title}` : null}
  onclick={action ? handleClick : undefined}
  onkeydown={action ? handleKey : undefined}
>
  <header>
    <span class="title">
      {title}
      {#if action}<ChevronRight size={16} strokeWidth={2.5} />{/if}
    </span>
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
  .tappable {
    cursor: pointer;
    outline-offset: 4px;
  }
  .tappable:focus-visible {
    outline: var(--border-normal) solid var(--ink);
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
    font-size: 16px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink);
  }

  .header-right {
    display: inline-flex;
    align-items: center;
    gap: 14px;
  }
  .meta {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 15px;
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
    font-size: 14px;
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

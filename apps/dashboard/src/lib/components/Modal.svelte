<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import { X } from 'lucide-svelte';

  let {
    title,
    onClose,
    children,
  }: { title?: string; onClose: () => void; children: Snippet } = $props();

  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onClose} role="presentation">
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="card" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()}>
    <header class="head">
      {#if title}<span class="title">{title}</span>{/if}
      <button class="close" onclick={onClose} aria-label="Close">
        <X size={22} strokeWidth={2.5} />
      </button>
    </header>
    {@render children()}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: var(--scrim);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
  }
  .card {
    background: var(--paper);
    border: var(--border-normal) solid var(--ink);
    padding: 24px 28px 28px;
    width: min(600px, 100%);
    box-sizing: border-box;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 14px;
    margin-bottom: 18px;
    border-bottom: var(--border-normal) solid var(--ink);
  }
  .title {
    font-family: var(--font-serif);
    font-weight: 600;
    font-size: 28px;
    color: var(--ink);
  }
  .close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border: var(--border-normal) solid var(--hairline);
    background: var(--paper);
    color: var(--ink);
    flex: 0 0 auto;
  }
</style>

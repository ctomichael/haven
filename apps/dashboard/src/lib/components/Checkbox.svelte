<script lang="ts">
  import { Check } from 'lucide-svelte';

  let {
    checked = false,
    onchange,
  }: { checked?: boolean; onchange?: (next: boolean) => void } = $props();
</script>

<button
  type="button"
  class="cb"
  role="checkbox"
  aria-checked={checked}
  onclick={(e) => {
    e.stopPropagation();
    onchange?.(!checked);
  }}
>
  <span class="box" class:checked>
    {#if checked}
      <Check size={20} strokeWidth={3} color="white" />
    {/if}
  </span>
</button>

<style>
  .cb {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    padding: 0;
  }
  .box {
    width: 32px;
    height: 32px;
    border: var(--border-normal) solid var(--ink);
    background: var(--paper);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .box.checked {
    background: var(--accent-sage);
    border-color: var(--accent-sage);
  }
</style>

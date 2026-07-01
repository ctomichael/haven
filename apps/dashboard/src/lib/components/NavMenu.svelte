<script lang="ts">
  import { goto } from '$app/navigation';
  import Modal from './Modal.svelte';
  import { NAV_DESTINATIONS } from '$lib/nav';

  let { onClose }: { onClose: () => void } = $props();

  function nav(href: string) {
    onClose();
    goto(href);
  }
</script>

<Modal title="Go to" {onClose}>
  <div class="grid">
    {#each NAV_DESTINATIONS as d (d.href)}
      {@const Icon = d.icon}
      <button class="dest" onclick={() => nav(d.href)}>
        <Icon size={34} strokeWidth={1.75} />
        <span class="label">{d.label}</span>
      </button>
    {/each}
  </div>
</Modal>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }
  .dest {
    aspect-ratio: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    border: var(--border-normal) solid var(--ink);
    background: var(--paper);
    color: var(--ink);
  }
  .label {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
</style>

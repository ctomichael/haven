<script lang="ts">
  import { Globe } from 'lucide-svelte';
  import { weatherIcon } from '$lib/weatherIcons';

  // Morning (left), afternoon (top) and evening (right) conditions arranged in
  // a semicircle around a small globe.
  let {
    morning,
    afternoon,
    evening,
  }: {
    morning?: string | null;
    afternoon?: string | null;
    evening?: string | null;
  } = $props();

  let M = $derived(morning ? weatherIcon(morning) : null);
  let A = $derived(afternoon ? weatherIcon(afternoon) : null);
  let E = $derived(evening ? weatherIcon(evening) : null);
</script>

<div class="cluster" aria-hidden="true">
  {#if A}{@const Ai = A}<span class="pos top"><Ai size={20} strokeWidth={2} /></span>{/if}
  {#if M}{@const Mi = M}<span class="pos left"><Mi size={20} strokeWidth={2} /></span>{/if}
  {#if E}{@const Ei = E}<span class="pos right"><Ei size={20} strokeWidth={2} /></span>{/if}
  <span class="globe"><Globe size={22} strokeWidth={1.75} /></span>
</div>

<style>
  .cluster {
    position: relative;
    width: 84px;
    height: 50px;
    color: var(--ink);
  }
  .globe {
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    color: var(--ink-2);
  }
  .pos {
    position: absolute;
    display: inline-flex;
  }
  .pos.top {
    top: 0;
    left: 50%;
    transform: translateX(-50%);
  }
  .pos.left {
    left: 0;
    bottom: 6px;
  }
  .pos.right {
    right: 0;
    bottom: 6px;
  }
</style>

<script lang="ts">
  import { Mountain } from 'lucide-svelte';
  import { weatherIcon } from '$lib/weatherIcons';

  // Morning (left), afternoon (top) and evening (right) conditions arranged in
  // a semicircle around a small mountain (we live in the mountains).
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
  {#if A}{@const Ai = A}<span class="pos top"><Ai size={30} strokeWidth={2} /></span>{/if}
  {#if M}{@const Mi = M}<span class="pos left"><Mi size={30} strokeWidth={2} /></span>{/if}
  {#if E}{@const Ei = E}<span class="pos right"><Ei size={30} strokeWidth={2} /></span>{/if}
  <span class="center"><Mountain size={32} strokeWidth={1.75} /></span>
</div>

<style>
  .cluster {
    position: relative;
    width: 104px;
    height: 66px;
    color: var(--ink);
    flex: 0 0 auto;
  }
  .center {
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
    bottom: 8px;
  }
  .pos.right {
    right: 0;
    bottom: 8px;
  }
</style>

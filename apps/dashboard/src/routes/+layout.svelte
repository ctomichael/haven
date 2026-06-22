<script lang="ts">
  import '../app.css';
  import type { Surface } from '$lib/surface';
  import { onMount } from 'svelte';

  let { children } = $props();

  // Pick surface from ?surface= query, then by viewport width.
  // The CSS rules read body[data-surface=...] — components don't read
  // this directly in v0, so we don't bother with a context provider yet.
  onMount(() => {
    const u = new URL(window.location.href);
    const fromQuery = u.searchParams.get('surface');
    let surface: Surface;
    if (fromQuery === 'eink' || fromQuery === 'phone') {
      surface = fromQuery;
    } else if (window.innerWidth <= 600) {
      surface = 'phone';
    } else {
      surface = 'eink';
    }
    document.body.dataset.surface = surface;
  });
</script>

{@render children()}

<script lang="ts">
  import Cell from './Cell.svelte';
  import { widgetsFor, type ResolvedWidget } from '$lib/widgets/registry';
  import type { Surface } from '$lib/surface';

  // Renders the registry-driven widgets for this surface (dispatched widgets
  // land here without touching the tuned base grid). Re-evaluates the schedule
  // window periodically so time-gated widgets appear/disappear on their own.

  let { surface }: { surface: Surface } = $props();

  let now = $state(new Date());
  let resolved = $derived<ResolvedWidget[]>(widgetsFor(surface, now));

  $effect(() => {
    // Re-check the schedule window every minute. A broken widget fails inside
    // its own frame; the host never throws (widgetsFor already dropped any
    // slug without a component).
    const t = setInterval(() => (now = new Date()), 60_000);
    return () => clearInterval(t);
  });
</script>

{#each resolved as { entry, component } (entry.slug)}
  {@const SvelteComponent = component}
  <Cell w={entry.position?.col_span ?? 6}>
    <SvelteComponent />
  </Cell>
{/each}

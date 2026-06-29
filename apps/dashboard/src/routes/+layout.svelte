<script lang="ts">
  import '../app.css';
  import type { Surface } from '$lib/surface';
  import { onDestroy, onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { busy } from '$lib/busy.svelte';

  let { children } = $props();

  let es: EventSource | undefined;
  let storedStartedAt: string | null = null;

  // A deploy landed while the UI was mid-operation (e.g. recording a voice
  // note). Hold the hard reload until the user is idle so we don't lose it.
  let pendingReload = $state(false);

  $effect(() => {
    if (pendingReload && !busy.active) {
      window.location.reload();
    }
  });

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

    // Auto-reload when the backend restarts with a new started_at —
    // i.e. after a deploy lands. EventSource auto-reconnects on
    // disconnect, and the backend sends a `hello` payload on every
    // connect. First hello: remember. Subsequent different hello:
    // hard reload to pick up the new JS bundle.
    es = new EventSource('/api/events');
    es.addEventListener('hello', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { started_at?: string };
        if (!data.started_at) return;
        if (storedStartedAt !== null && storedStartedAt !== data.started_at) {
          // eslint-disable-next-line no-console
          console.log(
            `[haven] backend started_at changed (${storedStartedAt} → ${data.started_at}); ` +
              (busy.active ? 'deferring reload (UI busy)' : 'reloading'),
          );
          // Defer the hard reload while mid-operation; the $effect above
          // flushes it the moment busy clears.
          if (busy.active) {
            pendingReload = true;
          } else {
            window.location.reload();
          }
          return;
        }
        storedStartedAt = data.started_at;
      } catch {
        /* malformed payload — ignore */
      }
    });

    // Live data push: a write elsewhere (MCP, or another surface via the
    // backend) fires NOTIFY haven_reload → this event. Re-run load()
    // functions to pull fresh data — no full page reload, so no flash.
    es.addEventListener('dashboard:reload', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { surface?: 'wall' | 'phone' | 'all' };
        const target = data.surface ?? 'all';
        const mine = surface === 'eink' ? 'wall' : 'phone';
        if (target === 'all' || target === mine) {
          invalidateAll();
        }
      } catch {
        /* malformed payload — refresh anyway */
        invalidateAll();
      }
    });
  });

  onDestroy(() => {
    es?.close();
  });
</script>

{@render children()}

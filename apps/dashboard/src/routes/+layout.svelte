<script lang="ts">
  import '../app.css';
  import type { Surface } from '$lib/surface';
  import { onDestroy, onMount } from 'svelte';
  import { invalidateAll } from '$app/navigation';
  import { busy } from '$lib/busy.svelte';
  import AgentQuestionModal from '$lib/components/AgentQuestionModal.svelte';
  import { fetchQuestions, type ApiQuestion } from '$lib/api';

  let { children } = $props();

  let es: EventSource | undefined;
  let storedStartedAt: string | null = null;

  // --- Agent questions (modal popover) ---------------------------------
  // Open questions for this surface, shown one at a time. Populated on mount
  // and whenever an 'agent:question' SSE event arrives. `dismissed` makes the
  // "Later" action stick until a genuinely new question or a reload.
  let surface: Surface = 'eink';
  let questions = $state<ApiQuestion[]>([]);
  let dismissed = new Set<string>();
  let current = $derived(questions.find((q) => !dismissed.has(q.id)) ?? null);

  async function refreshQuestions() {
    try {
      const surfaceParam = surface === 'eink' ? 'wall' : 'phone';
      questions = await fetchQuestions(fetch, { surface: surfaceParam, limit: 10 });
    } catch {
      /* backend unreachable — leave the queue as-is */
    }
  }

  function onQuestionDone() {
    // Answered: drop it and pull the rest afresh (it may have unblocked more).
    if (current) dismissed.add(current.id);
    refreshQuestions();
  }
  function onQuestionDismiss() {
    if (current) dismissed.add(current.id);
    // Reassign to re-run the derived `current`.
    questions = [...questions];
  }

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
    if (fromQuery === 'eink' || fromQuery === 'phone') {
      surface = fromQuery;
    } else if (window.innerWidth <= 600) {
      surface = 'phone';
    } else {
      surface = 'eink';
    }
    document.body.dataset.surface = surface;

    // Pick up any questions already waiting (e.g. asked while this surface
    // was closed), then rely on the SSE listener below for new ones.
    refreshQuestions();

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

    // Agent asked a question — pull the open set for this surface and show
    // the modal. We re-fetch rather than trust the event payload so the
    // question data is authoritative (and typed).
    es.addEventListener('agent:question', (event: MessageEvent) => {
      try {
        const data = JSON.parse(event.data) as { surface?: 'wall' | 'phone' | 'all' };
        const target = data.surface ?? 'all';
        const mine = surface === 'eink' ? 'wall' : 'phone';
        if (target === 'all' || target === mine) refreshQuestions();
      } catch {
        refreshQuestions();
      }
    });
  });

  onDestroy(() => {
    es?.close();
  });
</script>

{@render children()}

{#if current}
  <AgentQuestionModal question={current} onDone={onQuestionDone} onDismiss={onQuestionDismiss} />
{/if}

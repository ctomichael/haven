<script lang="ts">
  import WidgetFrame from './WidgetFrame.svelte';
  import { ackBriefing, type ApiBriefing, type BriefingSeverity } from '$lib/api';
  import { invalidateAll } from '$app/navigation';

  let { briefings = [] }: { briefings?: ApiBriefing[] } = $props();

  // Severity → accent token. Colour is decorative only — the label carries
  // the meaning, so the widget is fully legible in pure B&W (e-ink rule).
  const accentVar: Record<BriefingSeverity, string> = {
    info: 'var(--accent-stone)',
    attention: 'var(--accent-amber)',
    urgent: 'var(--accent-rust)',
  };
  const sevLabel: Record<BriefingSeverity, string> = {
    info: 'FYI',
    attention: 'SOON',
    urgent: 'NOW',
  };

  // Local copy so an acknowledged item disappears immediately; invalidateAll
  // re-syncs from the backend.
  let items = $state<ApiBriefing[]>([]);
  $effect(() => {
    items = briefings;
  });

  async function acknowledge(b: ApiBriefing) {
    items = items.filter((i) => i.id !== b.id);
    try {
      await ackBriefing(b.id);
    } finally {
      invalidateAll();
    }
  }
</script>

{#if items.length > 0}
  <WidgetFrame title="Briefing" meta={String(items.length)}>
    <ul class="list">
      {#each items as b (b.id)}
        <li class="item">
          <button class="ack" onclick={() => acknowledge(b)} aria-label={`Acknowledge: ${b.title}`}>
            <span class="sev" style={`--sev: ${accentVar[b.severity]}`}>{sevLabel[b.severity]}</span>
            <span class="text">
              <span class="title">{b.title}</span>
              {#if b.body}<span class="body">{b.body}</span>{/if}
            </span>
          </button>
        </li>
      {/each}
    </ul>
  </WidgetFrame>
{/if}

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
  }
  .item + .item {
    border-top: var(--border-thin) solid var(--hairline);
  }
  .ack {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    width: 100%;
    text-align: left;
    background: var(--paper);
    border: none;
    padding: 14px 0;
    min-height: 64px;
    cursor: pointer;
    color: var(--ink);
  }
  .sev {
    flex: 0 0 auto;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.12em;
    padding: 3px 8px;
    border: var(--border-normal) solid var(--sev);
    color: var(--ink);
    margin-top: 2px;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .title {
    font-family: var(--font-sans);
    font-weight: 600;
    font-size: 18px;
    line-height: 1.3;
    color: var(--ink);
  }
  .body {
    font-family: var(--font-sans);
    font-weight: 400;
    font-size: 16px;
    line-height: 1.35;
    color: var(--ink-2);
  }
</style>

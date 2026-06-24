<script lang="ts">
  import SubScreen from '$lib/components/SubScreen.svelte';
  import AccentChip from '$lib/components/AccentChip.svelte';
  import FilterChips from '$lib/components/FilterChips.svelte';
  import { Mic, Image as ImageIcon, Paperclip } from 'lucide-svelte';
  import type { ApiInboxItem, InboxStatus } from '$lib/api';
  import type { Accent } from '$lib/tokens';

  let { data }: { data: { inbox: ApiInboxItem[] } } = $props();

  let filter = $state<'all' | InboxStatus>('all');

  let visible = $derived(
    filter === 'all' ? data.inbox : data.inbox.filter((i) => i.status === filter),
  );
  let pendingCount = $derived(data.inbox.filter((i) => i.status === 'pending').length);
  let filedCount = $derived(data.inbox.filter((i) => i.status === 'filed').length);
  let meta = $derived(`${pendingCount} PENDING · ${filedCount} FILED · ${data.inbox.length} TOTAL`);

  // Status → accent for the badge.
  function statusAccent(status: InboxStatus): Accent {
    return status === 'filed' ? 'sage' : status === 'pending' ? 'amber' : 'stone';
  }

  // "Processing" is a derived state — pending + has attachment waiting for
  // OCR or with `[handwritten note — pending OCR]` placeholder.
  function isProcessing(item: ApiInboxItem): boolean {
    if (item.status !== 'pending') return false;
    if (item.raw_text.startsWith('[handwritten note')) return true;
    return false;
  }

  function relativeTime(ts: string): string {
    const date = new Date(ts);
    const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diffSec < 60) return 'JUST NOW';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} MIN AGO`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} HR AGO`;
    if (diffSec < 7 * 86400) return `${Math.floor(diffSec / 86400)} D AGO`;
    return date
      .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
      .toUpperCase();
  }

  type Attachment = { kind: 'audio' | 'image' | 'other'; url: string; mime: string };
  function attachments(item: ApiInboxItem): Attachment[] {
    const raw = item.metadata?.attachments;
    if (!raw || !Array.isArray(raw)) return [];
    return raw.map((a) => ({
      kind: a.mime?.startsWith('audio/')
        ? 'audio'
        : a.mime?.startsWith('image/')
          ? 'image'
          : 'other',
      url: a.url,
      mime: a.mime,
    }));
  }
</script>

<SubScreen title="Inbox" {meta}>
  <div class="filters">
    <FilterChips
      options={[
        { id: 'all', label: 'All' },
        { id: 'pending', label: 'Pending' },
        { id: 'filed', label: 'Filed' },
        { id: 'ignored', label: 'Ignored' },
      ]}
      selected={filter}
      onSelect={(id) => (filter = id as typeof filter)}
    />
  </div>

  {#if visible.length === 0}
    <p class="empty">No items in this view.</p>
  {/if}

  <ul class="list">
    {#each visible as item (item.id)}
      {@const atts = attachments(item)}
      {@const proc = isProcessing(item)}
      {@const propCat = item.metadata?.proposedCategory}
      <li class="card" class:processing={proc}>
        <header>
          <span class="source-time">
            <span class="source">{item.source}</span>
            <span class="sep">·</span>
            <span class="time">{relativeTime(item.ts)}</span>
            {#if item.metadata?.input_mode}
              <span class="sep">·</span>
              <span class="mode">{String(item.metadata.input_mode)}</span>
            {/if}
          </span>
          <span class="status-cluster">
            {#if proc}
              <span class="processing-badge">
                <span class="pulse" aria-hidden="true"></span>
                PROCESSING
              </span>
            {/if}
            <AccentChip
              accent={statusAccent(item.status)}
              label={item.status.toUpperCase()}
            />
          </span>
        </header>

        <p class="text">{item.raw_text}</p>

        {#if atts.length > 0 || item.filed_refs.length > 0 || propCat}
          <footer>
            {#each atts as a, i (i)}
              <a class="att" href={a.url} target="_blank" rel="noreferrer">
                {#if a.kind === 'audio'}
                  <Mic size={14} strokeWidth={2.5} />
                  Audio
                {:else if a.kind === 'image'}
                  <ImageIcon size={14} strokeWidth={2.5} />
                  Image
                {:else}
                  <Paperclip size={14} strokeWidth={2.5} />
                  {a.mime}
                {/if}
              </a>
            {/each}
            {#if propCat && item.status === 'pending'}
              <span class="proposed">PROPOSED · {String(propCat)}</span>
            {/if}
            {#each item.filed_refs as ref (ref.ref_id)}
              <span class="filed-as">→ {ref.kind}</span>
            {/each}
          </footer>
        {/if}
      </li>
    {/each}
  </ul>
</SubScreen>

<style>
  .filters {
    padding-bottom: 6px;
  }
  .empty {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.18em;
    color: var(--muted-mono);
    text-transform: uppercase;
    padding: 8px 0;
  }
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    overflow: auto;
    flex: 1;
    min-height: 0;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 16px 4px;
    border-bottom: var(--border-thin) solid var(--hairline);
  }
  .card.processing {
    background: var(--accent-amber-tint);
    padding-left: 12px;
    padding-right: 12px;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .source-time {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
  .sep {
    color: var(--muted-mono);
  }
  .status-cluster {
    display: inline-flex;
    align-items: center;
    gap: 10px;
  }
  .processing-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.18em;
    color: var(--ink);
    text-transform: uppercase;
  }
  .pulse {
    width: 8px;
    height: 8px;
    background: var(--accent-amber);
    border-radius: 50%;
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); opacity: 1; }
    50%      { transform: scale(0.55); opacity: 0.4; }
  }
  .text {
    margin: 0;
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 22px;
    line-height: 1.35;
    color: var(--ink);
    white-space: pre-wrap;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  .att {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border: var(--border-normal) solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    text-decoration: none;
  }
  .proposed {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.16em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
  .filed-as {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.16em;
    color: var(--ink);
    text-transform: uppercase;
  }
</style>

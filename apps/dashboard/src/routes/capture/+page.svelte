<script lang="ts">
  import { goto } from '$app/navigation';
  import { Mic, Image as ImageIcon, X as XIcon, Eraser } from 'lucide-svelte';
  import AccentChip from '$lib/components/AccentChip.svelte';
  import PenCanvas, { type PenHandle } from '$lib/components/PenCanvas.svelte';
  import { uploadAttachment } from '$lib/api';

  let mode = $state<'type' | 'draw' | 'ink'>('type');
  let draft = $state('');
  let textareaEl: HTMLTextAreaElement | undefined = $state();
  let penHandle: PenHandle | null = $state(null);
  let inkSupported = $state<boolean | null>(null);
  let saving = $state(false);

  let suggestions = ['HOME', 'KIDS', 'ERRANDS', 'WORK'];
  let selected = $state('HOME');

  function chipAccent(s: string): 'sage' | 'amber' | 'stone' | 'sky' {
    return s === 'HOME' ? 'sage' : s === 'KIDS' ? 'amber' : s === 'ERRANDS' ? 'stone' : 'sky';
  }

  // Autofocus textarea when entering type mode.
  $effect(() => {
    if (mode === 'type' && textareaEl) {
      // microtask so DOM has updated
      queueMicrotask(() => textareaEl?.focus());
    }
  });

  async function save() {
    if (saving) return;
    saving = true;

    let rawText = draft.trim();
    type Attachment = { id: string; url: string; mime: string; size_bytes: number };
    const attachments: Attachment[] = [];

    if ((mode === 'draw' || mode === 'ink') && penHandle && !penHandle.isEmpty()) {
      const blob = await penHandle.getBlob('image/png');
      if (blob) {
        try {
          const att = await uploadAttachment(blob, 'pen-note.png');
          attachments.push({
            id: att.id,
            url: att.url,
            mime: att.mime,
            size_bytes: att.size_bytes,
          });
          if (!rawText) rawText = '[handwritten note — pending OCR]';
        } catch {
          saving = false;
          return; // don't navigate on failure
        }
      }
    }

    if (!rawText && attachments.length === 0) {
      goto('/');
      return;
    }

    try {
      await fetch('/api/inbox', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'wall',
          raw_text: rawText,
          metadata: {
            proposedCategory: selected,
            attachments,
            input_mode: mode,
            ink_supported: inkSupported,
          },
        }),
      });
    } catch {
      /* don't surface in v0; inbox is forgiving */
    }
    goto('/');
  }
</script>

<main class="overlay">
  <header>
    <span class="title"><span class="dot" aria-hidden="true"></span> NEW NOTE</span>
    <a class="close" href="/" aria-label="Close"><XIcon size={28} strokeWidth={2.5} /></a>
  </header>

  <div class="mode-row">
    <div class="seg">
      <button
        type="button"
        class:on={mode === 'type'}
        onclick={() => (mode = 'type')}
      >Type</button>
      <button
        type="button"
        class:on={mode === 'draw'}
        onclick={() => (mode = 'draw')}
      >Draw</button>
      <button
        type="button"
        class:on={mode === 'ink'}
        onclick={() => (mode = 'ink')}
        disabled={inkSupported === false}
        title={
          inkSupported === true
            ? 'Ink Enhancement API supported'
            : inkSupported === false
              ? 'navigator.ink not available'
              : 'Detecting…'
        }
      >
        Ink
        <span class="status">
          {inkSupported === true ? '✓' : inkSupported === false ? '—' : '…'}
        </span>
      </button>
    </div>
    {#if mode === 'draw' || mode === 'ink'}
      <button type="button" class="clear" onclick={() => penHandle?.clear()}>
        <Eraser size={20} strokeWidth={2.5} />
        Clear
      </button>
    {/if}
  </div>

  <div class="draft">
    <span class="bar" aria-hidden="true"></span>
    <div class="surface">
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        class:active={mode === 'type'}
        bind:this={textareaEl}
        bind:value={draft}
        placeholder="What's on your mind?"
        spellcheck="false"
      ></textarea>
      <div class="canvas-wrap" class:active={mode === 'draw' || mode === 'ink'}>
        <PenCanvas
          onReady={(h) => (penHandle = h)}
          inkTrails={mode === 'ink'}
          onInkAvailable={(b) => (inkSupported = b)}
        />
      </div>
    </div>
  </div>

  <section class="hermes">
    <span class="caption">Hermes suggests</span>
    <div class="chips">
      {#each suggestions as s (s)}
        <button
          type="button"
          class="chip-button"
          class:on={selected === s}
          onclick={() => (selected = s)}
        >
          <AccentChip accent={chipAccent(s)} label={s} />
        </button>
      {/each}
    </div>
  </section>

  <footer>
    <div class="left">
      <button type="button" class="mic" aria-label="Hold to speak">
        <Mic size={32} strokeWidth={2.5} />
        Hold to speak
      </button>
      <button type="button" class="photo" aria-label="Add photo">
        <ImageIcon size={28} strokeWidth={2.5} />
        Photo
      </button>
    </div>
    <div class="right">
      <a class="cancel" href="/">Cancel</a>
      <button type="button" class="save" onclick={save} disabled={saving}>
        {saving ? 'Saving…' : 'Save note'}
      </button>
    </div>
  </footer>
</main>

<style>
  .overlay {
    width: 100vw;
    min-height: 100vh;
    background: var(--paper);
    padding: 36px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    box-sizing: border-box;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: var(--border-normal) solid var(--ink);
    padding-bottom: 16px;
  }
  .title {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .dot {
    width: 10px;
    height: 10px;
    background: var(--ink);
    border-radius: 50%;
    display: inline-block;
  }
  .close {
    width: 56px;
    height: 56px;
    border: var(--border-normal) solid var(--ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: var(--paper);
    color: var(--ink);
  }

  .mode-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .seg {
    display: inline-flex;
    border: var(--border-normal) solid var(--ink);
  }
  .seg button {
    height: 48px;
    padding: 0 24px;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    border: 0;
    border-right: var(--border-normal) solid var(--ink);
  }
  .seg button:last-child { border-right: 0; }
  .seg button.on {
    background: var(--ink);
    color: var(--paper);
  }
  .seg button:disabled {
    color: var(--disabled);
    cursor: not-allowed;
  }
  .seg button .status {
    margin-left: 8px;
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 11px;
    letter-spacing: 0;
  }
  .clear {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    height: 48px;
    padding: 0 18px;
    border: var(--border-normal) solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 13px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }

  .draft {
    flex: 1;
    min-height: 240px;
    display: flex;
    gap: 16px;
    padding: 4px 0;
  }
  .bar {
    width: var(--border-thick);
    background: var(--ink);
    align-self: stretch;
    flex-shrink: 0;
  }
  .surface {
    position: relative;
    flex: 1;
    border: var(--border-normal) solid var(--hairline);
    min-height: 240px;
  }
  textarea {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: 0;
    outline: 0;
    resize: none;
    padding: 12px;
    background: transparent;
    color: var(--ink);
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 40px;
    line-height: 1.2;
    opacity: 0;
    pointer-events: none;
  }
  textarea.active {
    opacity: 1;
    pointer-events: auto;
  }
  textarea::placeholder { color: var(--muted-mono); }

  .canvas-wrap {
    position: absolute;
    inset: 0;
    opacity: 0;
    pointer-events: none;
  }
  .canvas-wrap.active {
    opacity: 1;
    pointer-events: auto;
  }

  .hermes {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .caption {
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .chips {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .chip-button {
    padding: 0;
    border: 0;
    background: transparent;
  }
  .chip-button.on :global(.chip) {
    outline: var(--border-normal) solid var(--ink);
    outline-offset: 2px;
  }

  footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    border-top: var(--border-normal) solid var(--ink);
    padding-top: 16px;
  }
  .left, .right {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .mic {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    height: 64px;
    padding: 0 22px;
    border: var(--border-thick) solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .photo {
    display: inline-flex;
    align-items: center;
    gap: 12px;
    height: 64px;
    padding: 0 22px;
    border: var(--border-normal) solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .cancel {
    height: 64px;
    padding: 0 22px;
    display: inline-flex;
    align-items: center;
    border: var(--border-normal) solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    text-decoration: none;
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .save {
    height: 64px;
    padding: 0 32px;
    border: var(--border-thick) solid var(--ink);
    background: var(--ink);
    color: var(--paper);
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .save:disabled { opacity: 0.6; }
</style>

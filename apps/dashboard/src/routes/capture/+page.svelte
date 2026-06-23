<script lang="ts">
  import { goto } from '$app/navigation';
  import { Mic, Image as ImageIcon, X as XIcon } from 'lucide-svelte';
  import AccentChip from '$lib/components/AccentChip.svelte';

  let draft = $state('');

  let suggestions = ['HOME', 'KIDS', 'ERRANDS', 'WORK'];
  let selected = $state('HOME');

  async function save() {
    if (!draft.trim()) {
      goto('/');
      return;
    }
    try {
      await fetch('/api/inbox', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          source: 'wall',
          raw_text: draft,
          metadata: { proposedCategory: selected },
        }),
      });
    } catch {
      // For v0 we don't surface errors; the inbox is forgiving.
    }
    goto('/');
  }
</script>

<main class="overlay">
  <header>
    <span class="title"><span class="dot" aria-hidden="true"></span> NEW NOTE</span>
    <a class="close" href="/" aria-label="Close"><XIcon size={28} strokeWidth={2.5} /></a>
  </header>

  <div class="draft">
    <span class="bar" aria-hidden="true"></span>
    <!-- svelte-ignore a11y_autofocus -->
    <textarea
      bind:value={draft}
      placeholder="What's on your mind?"
      autofocus
      spellcheck="false"
    ></textarea>
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
          <AccentChip
            accent={s === 'HOME'
              ? 'sage'
              : s === 'KIDS'
                ? 'amber'
                : s === 'ERRANDS'
                  ? 'stone'
                  : 'sky'}
            label={s}
          />
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
      <button type="button" class="save" onclick={save}>Save note</button>
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

  .draft {
    flex: 1;
    min-height: 200px;
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
  textarea {
    flex: 1;
    border: 0;
    outline: 0;
    resize: none;
    background: transparent;
    color: var(--ink);
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 40px;
    line-height: 1.2;
  }
  textarea::placeholder {
    color: var(--muted-mono);
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
  .left,
  .right {
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
</style>

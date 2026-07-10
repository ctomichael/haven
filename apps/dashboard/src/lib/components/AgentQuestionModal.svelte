<script lang="ts">
  import Modal from './Modal.svelte';
  import { answerQuestion, type ApiQuestion } from '$lib/api';

  let {
    question,
    answeredBy,
    onDone,
    onDismiss,
  }: {
    question: ApiQuestion;
    answeredBy?: string;
    // Called after a successful answer (parent advances to the next question).
    onDone: () => void;
    // "Later" — leave the question open, just close the modal.
    onDismiss: () => void;
  } = $props();

  let free = $state('');
  let submitting = $state(false);
  let error = $state(false);

  async function submit(answer: string) {
    if (submitting || !answer.trim()) return;
    submitting = true;
    error = false;
    try {
      await answerQuestion(question.id, answer.trim(), answeredBy);
      onDone();
    } catch {
      error = true;
      submitting = false;
    }
  }
</script>

<Modal title="A quick question" onClose={onDismiss}>
  <p class="q">{question.question}</p>

  {#if question.options.length > 0}
    <div class="options">
      {#each question.options as opt (opt)}
        <button class="opt" disabled={submitting} onclick={() => submit(opt)}>{opt}</button>
      {/each}
    </div>
  {/if}

  <form
    class="free"
    onsubmit={(e) => {
      e.preventDefault();
      submit(free);
    }}
  >
    <input
      type="text"
      bind:value={free}
      placeholder={question.options.length ? 'Or type an answer…' : 'Type your answer…'}
      disabled={submitting}
      aria-label="Answer"
    />
    <button type="submit" class="send" disabled={submitting || !free.trim()}>Send</button>
  </form>

  {#if error}<p class="err">Couldn't send — try again.</p>{/if}

  <button class="later" onclick={onDismiss} disabled={submitting}>Later</button>
</Modal>

<style>
  .q {
    font-family: var(--font-serif);
    font-size: 24px;
    line-height: 1.35;
    color: var(--ink);
    margin: 0 0 20px;
  }
  .options {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 18px;
  }
  .opt {
    min-height: 64px;
    padding: 12px 20px;
    font-family: var(--font-sans);
    font-weight: 600;
    font-size: 18px;
    background: var(--paper);
    border: var(--border-normal) solid var(--ink);
    color: var(--ink);
    cursor: pointer;
  }
  .opt:disabled {
    color: var(--disabled);
    border-color: var(--disabled);
    cursor: default;
  }
  .free {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }
  .free input {
    flex: 1;
    min-width: 0;
    min-height: 64px;
    padding: 0 16px;
    font-family: var(--font-sans);
    font-size: 18px;
    background: var(--paper);
    border: var(--border-normal) solid var(--ink);
    color: var(--ink);
  }
  .send {
    flex: 0 0 auto;
    min-height: 64px;
    padding: 0 24px;
    font-family: var(--font-sans);
    font-weight: 600;
    font-size: 18px;
    background: var(--ink);
    color: var(--paper);
    border: var(--border-normal) solid var(--ink);
    cursor: pointer;
  }
  .send:disabled {
    background: var(--disabled);
    border-color: var(--disabled);
    cursor: default;
  }
  .err {
    font-family: var(--font-sans);
    font-size: 15px;
    color: var(--accent-rust);
    margin: 0 0 12px;
  }
  .later {
    display: block;
    margin-left: auto;
    padding: 8px 4px;
    background: none;
    border: none;
    font-family: var(--font-mono);
    font-size: 14px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--ink-2);
    cursor: pointer;
  }
</style>

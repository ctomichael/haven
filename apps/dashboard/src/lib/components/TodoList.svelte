<script lang="ts">
  import { untrack } from 'svelte';
  import WidgetFrame from './WidgetFrame.svelte';
  import Checkbox from './Checkbox.svelte';
  import AccentChip from './AccentChip.svelte';
  import type { Todo } from '$lib/dummy';

  let {
    todos: initialTodos,
    onOpen,
  }: { todos: Todo[]; onOpen?: () => void } = $props();

  // Snapshot the initial list — interactions live in-component until the
  // real repo writes back. untrack() makes the capture-once intent explicit.
  let items: Todo[] = $state(untrack(() => [...initialTodos]));

  function toggle(id: string) {
    items = items.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
  }

  const categoryLabel = {
    sage:  'HOME',
    amber: 'KIDS',
    stone: 'ERRANDS',
    sky:   'WORK',
    rust:  'ALERT',
  } as const;
</script>

<WidgetFrame title="To-do" action onAction={onOpen}>
  <ul class="list">
    {#each items as t (t.id)}
      <li class="row" class:done={t.done}>
        <Checkbox checked={t.done} onchange={() => toggle(t.id)} />
        <span class="title">{t.title}</span>
        <AccentChip accent={t.accent} label={categoryLabel[t.accent]} />
      </li>
    {/each}
  </ul>
</WidgetFrame>

<style>
  .list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .row {
    display: grid;
    grid-template-columns: 64px 1fr auto;
    align-items: center;
    gap: 10px;
  }
  .title {
    font-family: var(--font-sans);
    font-size: 20px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .done .title {
    text-decoration: line-through;
    color: var(--ink-2);
  }
</style>

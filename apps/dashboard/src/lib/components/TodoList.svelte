<script lang="ts">
  import WidgetFrame from './WidgetFrame.svelte';
  import Checkbox from './Checkbox.svelte';
  import AccentChip from './AccentChip.svelte';
  import { todoAccent, type ApiTodo } from '$lib/api';

  /**
   * Stateless dashboard todo widget. The parent owns the list (so toggles
   * stay in sync with the API). `done` and `total` are the overall counts
   * for the meta line; when omitted they're computed from `todos`.
   */
  let {
    todos,
    done,
    total,
    onToggle,
    onOpen,
  }: {
    todos: ApiTodo[];
    done?: number;
    total?: number;
    onToggle?: (id: string, done: boolean) => void;
    onOpen?: () => void;
  } = $props();

  let computedDone = $derived(todos.filter((t) => t.done).length);
  let totalCount = $derived(total ?? todos.length);
  let doneCount = $derived(done ?? computedDone);
  let meta = $derived(`${doneCount} OF ${totalCount}`);

  const categoryLabel = {
    sage:  'HOME',
    amber: 'KIDS',
    stone: 'ERRANDS',
    sky:   'WORK',
    rust:  'ALERT',
  } as const;
</script>

<WidgetFrame title="To-do" {meta} action onAction={onOpen}>
  <ul class="list">
    {#each todos as t (t.id)}
      {@const accent = todoAccent(t)}
      <li class="row" class:done={t.done}>
        <Checkbox checked={t.done} onchange={() => onToggle?.(t.id, !t.done)} />
        <span class="title">{t.title}</span>
        <AccentChip {accent} label={categoryLabel[accent]} />
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
    font-weight: 500;
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

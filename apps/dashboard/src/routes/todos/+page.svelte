<script lang="ts">
  import { untrack } from 'svelte';
  import SubScreen from '$lib/components/SubScreen.svelte';
  import Checkbox from '$lib/components/Checkbox.svelte';
  import AccentChip from '$lib/components/AccentChip.svelte';
  import FilterChips from '$lib/components/FilterChips.svelte';
  import DashboardGrid from '$lib/components/DashboardGrid.svelte';
  import Cell from '$lib/components/Cell.svelte';
  import { Plus } from 'lucide-svelte';
  import { createTodo, patchTodo, todoAccent, type ApiTodo } from '$lib/api';

  let { data }: { data: { todos: ApiTodo[] } } = $props();

  let items: ApiTodo[] = $state(untrack(() => [...data.todos]));
  $effect(() => {
    items = data.todos;
  });

  let filter = $state<'all' | 'home' | 'errands' | 'kids'>('all');

  // New-todo input. The active filter seeds the tag so an item added while
  // "Kids" is selected stays in that view.
  let newTitle = $state('');
  let adding = $state(false);

  const filterTags: Record<Exclude<typeof filter, 'all'>, string[]> = {
    home: ['home'],
    errands: ['errands'],
    kids: ['kids'],
  };

  async function addTodo() {
    const title = newTitle.trim();
    if (!title || adding) return;
    adding = true;
    const tags = filter === 'all' ? [] : filterTags[filter];
    try {
      const created = await createTodo({ title, tags });
      items = [created, ...items];
      newTitle = '';
    } catch {
      // Leave the text in place so the user can retry.
    } finally {
      adding = false;
    }
  }

  const accentToFilter = {
    sage: 'home',
    amber: 'kids',
    stone: 'errands',
    sky: 'home',
    rust: 'home',
  } as const;
  const categoryLabel = {
    sage:  'HOME',
    amber: 'KIDS',
    stone: 'ERRANDS',
    sky:   'WORK',
    rust:  'ALERT',
  } as const;

  let visible = $derived(
    filter === 'all'
      ? items
      : items.filter((t) => accentToFilter[todoAccent(t)] === filter),
  );
  let doneCount = $derived(items.filter((t) => t.done).length);
  let meta = $derived(`${doneCount} OF ${items.length} DONE`);

  async function toggle(id: string, nextDone: boolean) {
    const prev = items;
    items = items.map((t) =>
      t.id === id ? { ...t, done: nextDone, done_at: nextDone ? new Date().toISOString() : null } : t,
    );
    try {
      await patchTodo(id, { done: nextDone });
    } catch {
      items = prev;
    }
  }
</script>

<SubScreen title="To-do" {meta}>
  <div class="filters">
    <FilterChips
      options={[
        { id: 'all',     label: 'All' },
        { id: 'home',    label: 'Home' },
        { id: 'errands', label: 'Errands' },
        { id: 'kids',    label: 'Kids' },
      ]}
      selected={filter}
      onSelect={(id) => (filter = id as typeof filter)}
    />
  </div>

  {#if visible.length === 0}
    <p class="empty">Nothing in this view.</p>
  {/if}

  <DashboardGrid columns={2} rows="auto" autoRows="auto" rowGap={12} columnGap={20}>
    {#each visible as t (t.id)}
      {@const accent = todoAccent(t)}
      <Cell w={1}>
        <div class="row" class:done={t.done}>
          <Checkbox checked={t.done} onchange={() => toggle(t.id, !t.done)} />
          <span class="title">{t.title}</span>
          <AccentChip {accent} label={categoryLabel[accent]} />
        </div>
      </Cell>
    {/each}
  </DashboardGrid>

  <form class="add" onsubmit={(e) => { e.preventDefault(); addTodo(); }}>
    <input
      class="add-input"
      type="text"
      bind:value={newTitle}
      placeholder="Add a to-do…"
      autocomplete="off"
      enterkeyhint="done"
    />
    <button type="submit" class="add-submit" aria-label="Add to-do" disabled={!newTitle.trim() || adding}>
      <Plus size={28} strokeWidth={2.5} />
    </button>
  </form>
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
  .row {
    display: grid;
    grid-template-columns: 64px 1fr auto;
    align-items: center;
    gap: 10px;
    border-bottom: var(--border-thin) solid var(--hairline);
    padding-bottom: 10px;
  }
  .title {
    font-family: var(--font-sans);
    font-weight: 500;
    font-size: 22px;
  }
  .done .title {
    text-decoration: line-through;
    color: var(--ink-2);
  }
  .add {
    margin-top: 16px;
    width: 100%;
    height: 72px;
    border: var(--border-normal) dashed var(--ink);
    background: var(--paper);
    color: var(--ink);
    display: flex;
    align-items: stretch;
    box-sizing: border-box;
  }
  .add-input {
    flex: 1;
    min-width: 0;
    border: none;
    background: transparent;
    color: var(--ink);
    padding: 0 20px;
    font-family: var(--font-sans);
    font-weight: 500;
    font-size: 22px;
  }
  .add-input::placeholder {
    color: var(--muted-mono);
    opacity: 1;
  }
  .add-input:focus {
    outline: none;
  }
  .add-submit {
    flex: 0 0 72px;
    border: none;
    border-left: var(--border-thin) dashed var(--ink);
    background: var(--paper);
    color: var(--ink);
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .add-submit:disabled {
    color: var(--muted-mono);
  }
</style>

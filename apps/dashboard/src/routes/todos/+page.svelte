<script lang="ts">
  import { untrack } from 'svelte';
  import SubScreen from '$lib/components/SubScreen.svelte';
  import Checkbox from '$lib/components/Checkbox.svelte';
  import AccentChip from '$lib/components/AccentChip.svelte';
  import FilterChips from '$lib/components/FilterChips.svelte';
  import DashboardGrid from '$lib/components/DashboardGrid.svelte';
  import Cell from '$lib/components/Cell.svelte';
  import { Plus } from 'lucide-svelte';
  import { goto } from '$app/navigation';
  import { dummy, type Todo } from '$lib/dummy';

  let items: Todo[] = $state(untrack(() => [...dummy.todosAll]));
  let filter = $state<'all' | 'home' | 'errands' | 'kids'>('all');

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
      : items.filter((t) => accentToFilter[t.accent] === filter),
  );
  let doneCount = $derived(items.filter((t) => t.done).length);
  let meta = $derived(`${doneCount} OF ${items.length} DONE`);

  function toggle(id: string) {
    items = items.map((t) => (t.id === id ? { ...t, done: !t.done } : t));
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

  <DashboardGrid columns={2} rows="auto" autoRows="auto" rowGap={12} columnGap={20}>
    {#each visible as t (t.id)}
      <Cell w={1}>
        <div class="row" class:done={t.done}>
          <Checkbox checked={t.done} onchange={() => toggle(t.id)} />
          <span class="title">{t.title}</span>
          <AccentChip accent={t.accent} label={categoryLabel[t.accent]} />
        </div>
      </Cell>
    {/each}
  </DashboardGrid>

  <button type="button" class="add" onclick={() => goto('/capture')}>
    <Plus size={28} strokeWidth={2.5} />
    Add to-do
  </button>
</SubScreen>

<style>
  .filters {
    padding-bottom: 6px;
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
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 16px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
</style>

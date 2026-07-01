<script lang="ts">
  import { untrack } from 'svelte';
  import SubScreen from '$lib/components/SubScreen.svelte';
  import Checkbox from '$lib/components/Checkbox.svelte';
  import { patchShopping, type ApiShoppingItem } from '$lib/api';

  let { data }: { data: { shopping: ApiShoppingItem[] } } = $props();

  let items: ApiShoppingItem[] = $state(untrack(() => [...data.shopping]));
  $effect(() => {
    items = data.shopping;
  });

  const aisleOrder = ['produce', 'bakery', 'dairy', 'pantry', 'other'] as const;
  const aisleLabel: Record<(typeof aisleOrder)[number], string> = {
    produce: 'Produce',
    bakery: 'Bakery',
    dairy: 'Dairy',
    pantry: 'Pantry',
    other: 'Other',
  };

  function normaliseAisle(a: string | null): (typeof aisleOrder)[number] {
    if (a === 'produce' || a === 'bakery' || a === 'dairy' || a === 'pantry') return a;
    return 'other';
  }

  let groups = $derived(
    aisleOrder
      .map((a) => ({
        aisle: a,
        items: items.filter((i) => normaliseAisle(i.aisle) === a),
      }))
      .filter((g) => g.items.length > 0),
  );
  let meta = $derived(`${items.length} ITEMS · ${groups.length} AISLES`);

  async function toggle(id: string, nextBought: boolean) {
    const prev = items;
    items = items.map((i) =>
      i.id === id
        ? {
            ...i,
            bought: nextBought,
            purchased_at: nextBought ? new Date().toISOString() : null,
          }
        : i,
    );
    try {
      await patchShopping(id, { bought: nextBought });
    } catch {
      items = prev;
    }
  }
</script>

<SubScreen title="Shopping" {meta}>
  {#if groups.length === 0}
    <p class="empty">List is empty.</p>
  {/if}

  <div class="cols">
    {#each groups as g (g.aisle)}
      <section class="group">
        <span class="caption">{aisleLabel[g.aisle]}</span>
        <ul>
          {#each g.items as it (it.id)}
            <li class:bought={it.bought}>
              <Checkbox checked={it.bought} onchange={() => toggle(it.id, !it.bought)} />
              <span class="name">{it.name}</span>
              {#if it.qty}<span class="qty">{it.qty}</span>{/if}
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  </div>
</SubScreen>

<style>
  .cols {
    flex: 1;
    min-height: 0;
    column-count: 2;
    column-gap: 36px;
  }
  .empty {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 15px;
    letter-spacing: 0.18em;
    color: var(--muted-mono);
    text-transform: uppercase;
    padding: 8px 0;
  }
  .group {
    display: block;
    break-inside: avoid;
    margin-bottom: 20px;
  }
  .caption {
    display: block;
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 16px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    padding-bottom: 8px;
    border-bottom: var(--border-normal) solid var(--ink);
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 6px;
  }
  li {
    display: grid;
    grid-template-columns: 64px 1fr auto;
    align-items: center;
    gap: 8px;
  }
  .bought .name {
    color: var(--accent-sage);
    text-decoration: line-through;
  }
  .name {
    font-family: var(--font-sans);
    font-weight: 500;
    font-size: 20px;
  }
  .qty {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 18px;
    color: var(--muted-mono);
    font-variant-numeric: tabular-nums;
  }
</style>

<script lang="ts">
  type Option = { id: string; label: string };

  let {
    options,
    selected,
    onSelect,
  }: {
    options: Option[];
    selected: string;
    onSelect: (id: string) => void;
  } = $props();
</script>

<div class="row">
  {#each options as o (o.id)}
    <button
      type="button"
      class="chip"
      class:on={selected === o.id}
      onclick={() => onSelect(o.id)}
    >
      {o.label}
    </button>
  {/each}
</div>

<style>
  .row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
  }
  .chip {
    height: 44px;
    padding: 0 18px;
    border: var(--border-normal) solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 15px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .chip.on {
    background: var(--ink);
    color: var(--paper);
  }
</style>

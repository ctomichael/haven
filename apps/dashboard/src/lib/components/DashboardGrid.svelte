<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * 12-column dashboard grid. Children are <Cell>s whose `w` (columns)
   * and `h` (rows) spans the grid auto-places left-to-right, wrapping
   * to the next row when full.
   *
   * `rows` accepts any valid grid-template-rows value:
   *   "200px 1fr 128px"  — explicit row sizes; 1fr = flex
   *   "auto"             — every row sizes to content
   *   "minmax(160px, 1fr)" + autoRows — uniform rows
   */
  let {
    columns = 12,
    rows = 'auto',
    autoRows = 'auto',
    columnGap = 26,
    rowGap = 28,
    children,
  }: {
    columns?: number;
    rows?: string;
    autoRows?: string;
    columnGap?: number;
    rowGap?: number;
    children: Snippet;
  } = $props();

  let style = $derived(
    [
      `grid-template-columns: repeat(${columns}, minmax(0, 1fr))`,
      `grid-template-rows: ${rows}`,
      `grid-auto-rows: ${autoRows}`,
      `column-gap: ${columnGap}px`,
      `row-gap: ${rowGap}px`,
    ].join('; '),
  );
</script>

<div class="grid" {style}>
  {@render children()}
</div>

<style>
  .grid {
    flex: 1;
    min-height: 0;
    display: grid;
  }
</style>

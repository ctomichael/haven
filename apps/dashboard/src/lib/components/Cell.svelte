<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * Grid cell inside a <DashboardGrid>.
   *
   *   <Cell w={5} h={1}>     — span 5 cols, 1 row (auto-placed)
   *   <Cell w={5} h={1} col={1} row={2}>   — explicit start lines
   *   <Cell w={5} fill>      — span 5 cols, fill rows to end (h auto)
   *
   * The cell is a flex-column container so the widget inside expands to
   * fill the available height (most WidgetFrame bodies use flex:1).
   */
  let {
    w = 1,
    h = 1,
    col,
    row,
    fill = false,
    children,
  }: {
    w?: number;
    h?: number;
    col?: number;
    row?: number;
    fill?: boolean;
    children: Snippet;
  } = $props();

  let style = $derived(
    [
      col != null ? `grid-column: ${col} / span ${w}` : `grid-column: span ${w}`,
      fill
        ? row != null
          ? `grid-row: ${row} / -1`
          : `grid-row: span ${h}; align-self: stretch`
        : row != null
          ? `grid-row: ${row} / span ${h}`
          : `grid-row: span ${h}`,
    ].join('; '),
  );
</script>

<div class="cell" {style}>
  {@render children()}
</div>

<style>
  .cell {
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>

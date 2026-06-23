<script lang="ts">
  /**
   * 2 px ink polyline sparkline. SVG is stretched via
   * preserveAspectRatio="none"; vector-effect keeps strokes crisp.
   */
  let {
    data,
    min,
    max,
    height = 60,
  }: {
    data: number[];
    min?: number;
    max?: number;
    height?: number;
  } = $props();

  let lo = $derived(min ?? Math.min(...data));
  let hi = $derived(max ?? Math.max(...data));
  let span = $derived(hi === lo ? 1 : hi - lo);

  // viewBox grid: 100 wide × 30 tall — stretched to fill
  let points = $derived(
    data
      .map((v, i) => {
        const x = (i / (data.length - 1)) * 100;
        const y = 30 - ((v - lo) / span) * 30;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(' '),
  );
</script>

<svg
  class="sparkline"
  viewBox="0 0 100 30"
  preserveAspectRatio="none"
  style="height: {height}px;"
>
  <polyline
    points={points}
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linejoin="round"
    stroke-linecap="round"
    vector-effect="non-scaling-stroke"
  />
</svg>

<style>
  .sparkline {
    display: block;
    width: 100%;
    color: var(--ink);
  }
</style>

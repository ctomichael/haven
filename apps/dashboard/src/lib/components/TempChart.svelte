<script lang="ts">
  import type { HaHistoryPoint } from '$lib/api';

  let {
    points,
    unit = '°C',
  }: { points: HaHistoryPoint[]; unit?: string | null } = $props();

  // Fixed viewBox; scales uniformly to the card width (meet → no distortion).
  const W = 560;
  const H = 240;
  const padL = 46;
  const padR = 14;
  const padT = 16;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  let ts = $derived(points.map((p) => new Date(p.t).getTime()));
  let vs = $derived(points.map((p) => p.v));
  let t0 = $derived(ts[0] ?? 0);
  let t1 = $derived(ts[ts.length - 1] ?? 1);
  let vlo = $derived(Math.min(...vs));
  let vhi = $derived(Math.max(...vs));
  // Pad the value domain so the line isn't glued to the top/bottom edge.
  let pad = $derived(Math.max(0.5, (vhi - vlo) * 0.15));
  let lo = $derived(vlo - pad);
  let hi = $derived(vhi + pad);

  const sx = (t: number) => padL + ((t - t0) / (t1 - t0 || 1)) * plotW;
  const sy = (v: number) => padT + (1 - (v - lo) / (hi - lo || 1)) * plotH;

  let line = $derived(points.map((p, i) => `${sx(ts[i]!).toFixed(1)},${sy(p.v).toFixed(1)}`).join(' '));
  let lastX = $derived(points.length ? sx(ts[ts.length - 1]!) : padL);
  let lastY = $derived(points.length ? sy(vs[vs.length - 1]!) : padT);

  const fmtV = (v: number) => `${v.toFixed(1)}`;
  const fmtT = (t: number) =>
    new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const fmtD = (t: number) =>
    new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });
</script>

<svg viewBox="0 0 {W} {H}" class="chart" role="img" aria-label="Temperature history">
  <!-- gridlines at data min & max -->
  <g class="grid">
    <line x1={padL} y1={sy(vhi)} x2={W - padR} y2={sy(vhi)} />
    <line x1={padL} y1={sy(vlo)} x2={W - padR} y2={sy(vlo)} />
  </g>
  <!-- y labels -->
  <text class="ylabel" x={padL - 8} y={sy(vhi)}>{fmtV(vhi)}</text>
  <text class="ylabel" x={padL - 8} y={sy(vlo)}>{fmtV(vlo)}</text>

  <!-- the trace -->
  <polyline
    points={line}
    fill="none"
    stroke="var(--ink)"
    stroke-width="2.5"
    stroke-linejoin="round"
    stroke-linecap="round"
    vector-effect="non-scaling-stroke"
  />

  <!-- current point -->
  {#if points.length}
    <circle cx={lastX} cy={lastY} r="4" fill="var(--ink)" />
  {/if}

  <!-- x axis labels -->
  <text class="xlabel start" x={padL} y={H - 6}>{fmtD(t0)} · {fmtT(t0)}</text>
  <text class="xlabel end" x={W - padR} y={H - 6}>NOW</text>
</svg>

<style>
  .chart {
    display: block;
    width: 100%;
    height: auto;
  }
  .grid line {
    stroke: var(--hairline-2);
    stroke-width: 1;
    stroke-dasharray: 3 4;
    vector-effect: non-scaling-stroke;
  }
  .ylabel {
    fill: var(--muted-mono);
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    text-anchor: end;
    dominant-baseline: middle;
  }
  .xlabel {
    fill: var(--muted-mono);
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.12em;
  }
  .xlabel.end {
    text-anchor: end;
  }
</style>

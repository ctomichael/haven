<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import WidgetFrame from './WidgetFrame.svelte';

  let now = $state(new Date());
  let timer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    timer = setInterval(() => (now = new Date()), 1000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  const pad = (n: number) => n.toString().padStart(2, '0');
  let timeHHMM = $derived(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
  let dateLong = $derived(
    now.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );
</script>

<WidgetFrame title="Now" live>
  <span class="time">{timeHHMM}</span>
  <span class="date">{dateLong}</span>
</WidgetFrame>

<style>
  .time {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 104px;
    line-height: 0.9;
    letter-spacing: -0.03em;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .date {
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 29px;
    color: var(--ink);
    margin-top: 12px;
  }
</style>

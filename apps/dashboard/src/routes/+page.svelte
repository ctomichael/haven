<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  import DashboardGrid from '$lib/components/DashboardGrid.svelte';
  import Cell from '$lib/components/Cell.svelte';

  import ClockWidget from '$lib/components/ClockWidget.svelte';
  import WeatherWidget from '$lib/components/WeatherWidget.svelte';
  import CalendarToday from '$lib/components/CalendarToday.svelte';
  import TodoList from '$lib/components/TodoList.svelte';
  import ShoppingList from '$lib/components/ShoppingList.svelte';
  import SensorTile from '$lib/components/SensorTile.svelte';
  import CaptureButton from '$lib/components/CaptureButton.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';

  import { dummy } from '$lib/dummy';

  // Masthead meta — week-of-year · day-of-year. Refresh once a minute.
  let now = $state(new Date());
  let timer: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    timer = setInterval(() => (now = new Date()), 60_000);
  });
  onDestroy(() => {
    if (timer) clearInterval(timer);
  });

  function weekOfYear(d: Date): number {
    const a = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = (a.getUTCDay() + 6) % 7;
    a.setUTCDate(a.getUTCDate() - dayNum + 3);
    const firstThursday = new Date(Date.UTC(a.getUTCFullYear(), 0, 4));
    return (
      1 + Math.round(((a.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
    );
  }
  function dayOfYear(d: Date): number {
    const start = new Date(d.getFullYear(), 0, 0);
    return Math.floor((d.getTime() - start.getTime()) / 86400000);
  }

  let mastheadMeta = $derived(`WEEK ${weekOfYear(now)} · ${dayOfYear(now)}/365`);
</script>

<main class="dash">
  <header class="masthead">
    <div class="title-block">
      <span class="title">{dummy.masthead.title}</span>
      <span class="subtitle">{dummy.masthead.subtitle}</span>
    </div>
    <span class="meta">{mastheadMeta}</span>
  </header>

  <DashboardGrid columns={12} rows="200px 1fr 128px">
    <Cell w={5}><ClockWidget /></Cell>
    <Cell w={7}>
      <WeatherWidget
        city={dummy.weather.city}
        currentTemp={dummy.weather.currentTemp}
        currentLabel={dummy.weather.currentLabel}
        forecast={dummy.weather.forecast}
      />
    </Cell>

    <Cell w={5}><CalendarToday events={dummy.calendar} /></Cell>
    <Cell w={4}><TodoList todos={dummy.todos} total={12} /></Cell>
    <Cell w={3}>
      <ShoppingList items={dummy.shopping.items} moreCount={dummy.shopping.moreCount} />
    </Cell>

    <Cell w={2}><SensorTile sensor={dummy.sensors[0]} /></Cell>
    <Cell w={2}><SensorTile sensor={dummy.sensors[1]} /></Cell>
    <Cell w={2}><SensorTile sensor={dummy.sensors[2]} /></Cell>
    <Cell w={6}><CaptureButton /></Cell>
  </DashboardGrid>

  <StatusBar
    online={dummy.status.online}
    lastSync={dummy.status.lastSync}
    hermesReady={dummy.status.hermesReady}
    identities={dummy.status.identities}
  />
</main>

<style>
  .dash {
    width: 100vw;
    min-height: 100vh;
    background: var(--paper);
    padding: 36px;
    display: flex;
    flex-direction: column;
    gap: 22px;
    box-sizing: border-box;
  }

  .masthead {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    padding-bottom: 16px;
    border-bottom: var(--border-normal) solid var(--ink);
    gap: 16px;
  }
  .title-block {
    display: flex;
    align-items: baseline;
    gap: 16px;
  }
  .title {
    font-family: var(--font-serif);
    font-weight: 600;
    font-size: 34px;
    line-height: 0.9;
    letter-spacing: 0.01em;
    color: var(--ink);
  }
  .subtitle {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.26em;
    color: var(--ink-2);
    text-transform: uppercase;
  }
  .meta {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.18em;
    color: var(--ink);
  }
</style>

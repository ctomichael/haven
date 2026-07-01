<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { untrack } from 'svelte';

  import DashboardGrid from '$lib/components/DashboardGrid.svelte';
  import Cell from '$lib/components/Cell.svelte';

  import ClockWidget from '$lib/components/ClockWidget.svelte';
  import WeatherWidget from '$lib/components/WeatherWidget.svelte';
  import CalendarToday from '$lib/components/CalendarToday.svelte';
  import TodoList from '$lib/components/TodoList.svelte';
  import ShoppingList from '$lib/components/ShoppingList.svelte';
  import SensorTile from '$lib/components/SensorTile.svelte';
  import SensorHistoryModal from '$lib/components/SensorHistoryModal.svelte';
  import CaptureButton from '$lib/components/CaptureButton.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import NavMenu from '$lib/components/NavMenu.svelte';
  import { LayoutGrid } from 'lucide-svelte';
  import { SENSOR_TILES } from '$lib/sensors';

  import { dummy } from '$lib/dummy';
  import { patchTodo, type ApiTodo, type ApiShoppingItem, type ApiWeather } from '$lib/api';

  let { data }: {
    data: {
      todos: ApiTodo[];
      shopping: ApiShoppingItem[];
      weather: ApiWeather | null;
      sensors: typeof dummy.sensors | null;
      calendar: typeof dummy.calendar | null;
    };
  } = $props();

  // Live weather when the backend reached MetService; dummy as the offline
  // fallback.
  let weather = $derived(data.weather ?? dummy.weather);

  // Live room temps from Home Assistant; dummy as the offline fallback.
  let sensors = $derived(data.sensors ?? dummy.sensors);

  // Today's events from the ICS feed; dummy as the offline fallback.
  let calendar = $derived(data.calendar ?? dummy.calendar);

  // Temperature-history modal — set to the tapped tile's entity + label.
  let openTile = $state<{ entity: string; label: string; unit: string } | null>(null);

  // Top-right navigation menu.
  let menuOpen = $state(false);

  // Local live state — initialised from the load() data, mutated optimistically
  // on toggle. SvelteKit re-runs load() on navigation, so we re-sync there too.
  let todos: ApiTodo[] = $state(untrack(() => [...data.todos]));
  let shopping: ApiShoppingItem[] = $state(untrack(() => [...data.shopping]));

  $effect(() => {
    // Re-sync when load() returns new data (e.g. nav back to /).
    todos = data.todos;
  });
  $effect(() => {
    shopping = data.shopping;
  });

  // Dashboard tile shows the top 5 open todos. Meta uses overall counts.
  let openTodos = $derived(todos.filter((t) => !t.done).slice(0, 5));
  let doneCount = $derived(todos.filter((t) => t.done).length);
  let totalTodos = $derived(todos.length);

  // Top 5 unbought shopping items; +N more shows remaining open.
  let unboughtShopping = $derived(shopping.filter((s) => !s.bought));
  let visibleShopping = $derived(unboughtShopping.slice(0, 5));
  let moreShopping = $derived(Math.max(0, unboughtShopping.length - 5));

  async function toggleTodo(id: string, nextDone: boolean) {
    // Optimistic update
    const prev = todos;
    todos = todos.map((t) =>
      t.id === id ? { ...t, done: nextDone, done_at: nextDone ? new Date().toISOString() : null } : t,
    );
    try {
      await patchTodo(id, { done: nextDone });
    } catch {
      // Revert on failure
      todos = prev;
    }
  }

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
    <div class="masthead-right">
      <span class="meta">{mastheadMeta}</span>
      <button class="menu-btn" onclick={() => (menuOpen = true)} aria-label="Open menu">
        <LayoutGrid size={24} strokeWidth={2} />
      </button>
    </div>
  </header>

  <DashboardGrid columns={12} rows="200px 1fr 128px">
    <Cell w={5}><ClockWidget /></Cell>
    <Cell w={7}>
      <WeatherWidget
        city={weather.city}
        currentTemp={weather.currentTemp}
        currentLabel={weather.currentLabel}
        forecast={weather.forecast}
      />
    </Cell>

    <Cell w={5}>
      <CalendarToday events={calendar} onOpen={() => goto('/calendar')} />
    </Cell>
    <Cell w={4}>
      <TodoList
        todos={openTodos}
        done={doneCount}
        total={totalTodos}
        onToggle={toggleTodo}
        onOpen={() => goto('/todos')}
      />
    </Cell>
    <Cell w={3}>
      <ShoppingList
        items={visibleShopping}
        total={shopping.length}
        moreCount={moreShopping}
        onOpen={() => goto('/shopping')}
      />
    </Cell>

    {#each sensors as sensor, i (SENSOR_TILES[i]?.entity ?? i)}
      <Cell w={2}>
        <SensorTile
          {sensor}
          onOpen={SENSOR_TILES[i]
            ? () =>
                (openTile = {
                  entity: SENSOR_TILES[i]!.entity,
                  label: sensor.label,
                  unit: sensor.unit,
                })
            : undefined}
        />
      </Cell>
    {/each}
    <Cell w={6}><CaptureButton onclick={() => goto('/capture')} /></Cell>
  </DashboardGrid>

  <StatusBar
    online={dummy.status.online}
    lastSync={dummy.status.lastSync}
    hermesReady={dummy.status.hermesReady}
    identities={dummy.status.identities}
  />
</main>

{#if openTile}
  <SensorHistoryModal
    entity={openTile.entity}
    label={openTile.label}
    unit={openTile.unit}
    onClose={() => (openTile = null)}
  />
{/if}

{#if menuOpen}
  <NavMenu onClose={() => (menuOpen = false)} />
{/if}

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
    font-size: 15px;
    letter-spacing: 0.26em;
    color: var(--ink-2);
    text-transform: uppercase;
  }
  .masthead-right {
    display: flex;
    align-items: center;
    gap: 18px;
  }
  .meta {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 15px;
    letter-spacing: 0.18em;
    color: var(--ink);
  }
  .menu-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 56px;
    height: 56px;
    border: var(--border-normal) solid var(--ink);
    background: var(--paper);
    color: var(--ink);
    cursor: pointer;
  }
</style>

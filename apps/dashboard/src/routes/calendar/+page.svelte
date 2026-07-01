<script lang="ts">
  import { goto } from '$app/navigation';
  import { ChevronLeft, ChevronRight } from 'lucide-svelte';
  import SubScreen from '$lib/components/SubScreen.svelte';
  import AccentDot from '$lib/components/AccentDot.svelte';
  import type { ApiCalEvent } from '$lib/api';
  import { parseYMD, addDays, localYMD, hhmm, accentFor, onLocalDate } from '$lib/calendar';

  let { data }: {
    data: { selectedYMD: string; weekStartYMD: string; events: ApiCalEvent[] | null };
  } = $props();

  const nowYMD = localYMD(new Date());
  const now = new Date();

  let events = $derived(data.events ?? []);
  let notConnected = $derived(data.events === null);

  // Seven-day strip for the week containing the selected date.
  let weekDays = $derived(
    Array.from({ length: 7 }, (_, i) => {
      const d = addDays(parseYMD(data.weekStartYMD), i);
      const ymd = localYMD(d);
      const dayEvents = events.filter((e) => onLocalDate(e, ymd));
      return {
        ymd,
        dow: d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase(),
        dayNum: d.getDate(),
        isToday: ymd === nowYMD,
        isSelected: ymd === data.selectedYMD,
        dots: dayEvents.slice(0, 3).map((e) => accentFor(e.title)),
      };
    }),
  );

  // Agenda for the selected day.
  let agenda = $derived(
    events
      .filter((e) => onLocalDate(e, data.selectedYMD))
      .map((e) => ({
        id: e.id,
        allDay: e.allDay,
        time: e.allDay ? 'All day' : hhmm(e.start),
        startMs: new Date(e.start).getTime(),
        accent: accentFor(e.title),
        title: e.title,
        sub: e.location ?? undefined,
        past: new Date(e.end) <= now && data.selectedYMD === nowYMD,
      }))
      .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.startMs - b.startMs),
  );

  // "Up next" = first non-past timed event, only when viewing today.
  let nextId = $derived(
    data.selectedYMD === nowYMD ? agenda.find((e) => !e.past && !e.allDay)?.id : undefined,
  );

  let selectedLabel = $derived(
    parseYMD(data.selectedYMD).toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }),
  );
  let meta = $derived(
    parseYMD(data.weekStartYMD)
      .toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
      .toUpperCase(),
  );

  function go(ymd: string) {
    goto(`/calendar?date=${ymd}`, { keepFocus: true, noScroll: true });
  }
  const shift = (days: number) => go(localYMD(addDays(parseYMD(data.selectedYMD), days)));
</script>

<SubScreen title="Calendar" {meta}>
  <section class="nav">
    <button class="chev" onclick={() => shift(-7)} aria-label="Previous week">
      <ChevronLeft size={22} strokeWidth={2.5} />
    </button>
    <div class="strip">
      {#each weekDays as d (d.ymd)}
        <button
          class="day"
          class:today={d.isToday}
          class:selected={d.isSelected}
          onclick={() => go(d.ymd)}
        >
          <span class="dow">{d.dow}</span>
          <span class="num">{d.dayNum}</span>
          <span class="dots">
            {#each d.dots as dot, i (i)}
              <AccentDot accent={dot} size={7} />
            {/each}
          </span>
        </button>
      {/each}
    </div>
    <button class="chev" onclick={() => shift(7)} aria-label="Next week">
      <ChevronRight size={22} strokeWidth={2.5} />
    </button>
  </section>

  <section class="agenda">
    <header class="agenda-head">
      <span class="caption">{selectedLabel}</span>
      <div class="quick">
        <button class="link" onclick={() => shift(-1)}>‹ Day</button>
        <button class="link" onclick={() => go(nowYMD)}>Today</button>
        <button class="link" onclick={() => shift(1)}>Day ›</button>
      </div>
    </header>

    {#if notConnected}
      <p class="empty">Calendar not connected.</p>
    {:else if agenda.length === 0}
      <p class="empty">Nothing scheduled.</p>
    {:else}
      <ul>
        {#each agenda as e (e.id)}
          <li class:past={e.past} class:next={e.id === nextId}>
            {#if e.id === nextId}<span class="next-bar" aria-hidden="true"></span>{/if}
            <span class="time" class:allday={e.allDay}>{e.time}</span>
            <span class="dot-wrap"><AccentDot accent={e.accent} size={10} /></span>
            <span class="title">{e.title}</span>
            {#if e.sub}<span class="sub">{e.sub}</span>{/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</SubScreen>

<style>
  .nav {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: stretch;
    gap: 8px;
  }
  .chev {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    border: var(--border-normal) solid var(--hairline);
    background: var(--paper);
    color: var(--ink);
  }
  .strip {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    border-top: var(--border-normal) solid var(--ink);
    border-bottom: var(--border-normal) solid var(--ink);
  }
  .day {
    padding: 12px 14px 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
    align-items: flex-start;
    background: var(--paper);
    border: 0;
    border-right: var(--border-normal) solid var(--hairline-2);
    color: var(--ink);
    text-align: left;
  }
  .day:last-child {
    border-right: 0;
  }
  .day.selected {
    background: var(--paper-2);
  }
  .day.today {
    border-bottom: var(--border-thick) solid var(--accent-amber);
    padding-bottom: 6px;
  }
  .dow {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.2em;
  }
  .num {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 26px;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .day.selected .num {
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .dots {
    display: inline-flex;
    gap: 5px;
    min-height: 7px;
  }

  .agenda {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 6px;
  }
  .agenda-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
  }
  .caption {
    font-family: var(--font-serif);
    font-weight: 600;
    font-size: 22px;
  }
  .quick {
    display: inline-flex;
    gap: 16px;
  }
  .link {
    border: 0;
    background: transparent;
    color: var(--ink-2);
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .empty {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.18em;
    color: var(--muted-mono);
    text-transform: uppercase;
    padding: 8px 0;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  li {
    display: grid;
    grid-template-columns: 96px 18px 1fr auto;
    align-items: baseline;
    gap: 16px;
    padding-left: 12px;
    position: relative;
  }
  .next .next-bar {
    position: absolute;
    left: 0;
    top: 2px;
    bottom: 2px;
    width: 4px;
    background: var(--accent-amber);
  }
  .past {
    opacity: 0.5;
  }
  .past .title {
    text-decoration: line-through;
  }
  .time {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 22px;
    font-variant-numeric: tabular-nums;
  }
  .time.allday {
    font-size: 13px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--muted-mono);
  }
  .dot-wrap {
    display: inline-flex;
    align-items: center;
  }
  .title {
    font-family: var(--font-sans);
    font-weight: 500;
    font-size: 22px;
  }
  .sub {
    font-family: var(--font-mono);
    font-weight: 500;
    font-size: 12px;
    letter-spacing: 0.18em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
</style>

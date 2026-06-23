<script lang="ts">
  import SubScreen from '$lib/components/SubScreen.svelte';
  import AccentDot from '$lib/components/AccentDot.svelte';
  import { dummy } from '$lib/dummy';

  // 7-day strip starting Monday of this week. The current day gets the
  // amber underline. Density dots are dummy for now.
  const weekDays = (() => {
    const today = new Date();
    const dayOfWeek = (today.getDay() + 6) % 7; // 0 = Mon
    const monday = new Date(today);
    monday.setDate(today.getDate() - dayOfWeek);
    const days: { label: string; dayNum: number; today: boolean; dots: Array<{ accent: 'sky' | 'amber' | 'sage' }> }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      days.push({
        label: d.toLocaleDateString('en-GB', { weekday: 'short' }).toUpperCase(),
        dayNum: d.getDate(),
        today: i === dayOfWeek,
        // Pretend density — varied per day
        dots: [
          { accent: 'sky' as const },
          ...(i % 2 === 0 ? [{ accent: 'amber' as const }] : []),
          ...(i === 1 || i === 3 ? [{ accent: 'sage' as const }] : []),
        ],
      });
    }
    return days;
  })();

  let weekMeta = $derived(
    `WEEK ${(() => {
      const a = new Date();
      const start = new Date(a.getFullYear(), 0, 1);
      const diff = (a.getTime() - start.getTime()) / 86400000;
      return Math.ceil((diff + start.getDay() + 1) / 7);
    })()} · ${new Date().toLocaleDateString('en-GB', { month: 'long' }).toUpperCase()}`,
  );
</script>

<SubScreen title="Calendar" meta={weekMeta}>
  <section class="strip">
    {#each weekDays as d (d.label + d.dayNum)}
      <div class="day" class:today={d.today}>
        <span class="dow">{d.label}</span>
        <span class="num">{d.dayNum}</span>
        <span class="dots">
          {#each d.dots as dot, i (i)}
            <AccentDot accent={dot.accent} size={8} />
          {/each}
        </span>
      </div>
    {/each}
  </section>

  <section class="agenda">
    <span class="caption">Agenda</span>
    <ul>
      {#each dummy.agenda as e (e.id)}
        <li class:past={e.past} class:next={e.isNext}>
          {#if e.isNext}<span class="next-bar" aria-hidden="true"></span>{/if}
          <span class="time">{e.start}</span>
          <span class="dot-wrap"><AccentDot accent={e.accent} size={10} /></span>
          <span class="title">{e.title}</span>
          {#if e.sub}<span class="sub">{e.sub}</span>{/if}
        </li>
      {/each}
    </ul>
  </section>

  <footer class="legend">
    <span class="legend-item"><AccentDot accent="sky" size={10} /> Work</span>
    <span class="legend-item"><AccentDot accent="amber" size={10} /> Family</span>
    <span class="legend-item"><AccentDot accent="sage" size={10} /> Personal</span>
  </footer>
</SubScreen>

<style>
  .strip {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 0;
    border-top: var(--border-normal) solid var(--ink);
    border-bottom: var(--border-normal) solid var(--ink);
  }
  .day {
    padding: 14px 16px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    border-right: var(--border-normal) solid var(--hairline-2);
  }
  .day:last-child {
    border-right: 0;
  }
  .day.today {
    background: var(--paper-2);
    border-bottom: var(--border-thick) solid var(--accent-amber);
    padding-bottom: 8px;
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
    font-size: 28px;
    font-variant-numeric: tabular-nums;
    line-height: 1;
  }
  .dots {
    display: inline-flex;
    gap: 6px;
    margin-top: 4px;
    min-height: 8px;
  }

  .agenda {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-top: 8px;
  }
  .caption {
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 14px;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .agenda ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .agenda li {
    display: grid;
    grid-template-columns: 80px 18px 1fr auto;
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
  .past { opacity: 0.5; }
  .past .title,
  .past .sub { text-decoration: line-through; }
  .time {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 22px;
  }
  .dot-wrap { display: inline-flex; align-items: center; }
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

  .legend {
    display: flex;
    gap: 28px;
    padding-top: 12px;
    border-top: var(--border-normal) solid var(--hairline-2);
  }
  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
</style>

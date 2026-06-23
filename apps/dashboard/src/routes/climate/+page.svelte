<script lang="ts">
  import BackToDashboard from '$lib/components/BackToDashboard.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import DashboardGrid from '$lib/components/DashboardGrid.svelte';
  import Cell from '$lib/components/Cell.svelte';

  import ClimateTile from '$lib/components/ClimateTile.svelte';
  import SleepSackTile from '$lib/components/SleepSackTile.svelte';
  import BinDayTile from '$lib/components/BinDayTile.svelte';
  import RoomsList from '$lib/components/RoomsList.svelte';
  import RuntimeBars from '$lib/components/RuntimeBars.svelte';

  import { dummy } from '$lib/dummy';

  // Last 7 days, oldest to today, label letters from today backwards.
  const today = new Date();
  const weekLabels = (() => {
    const out: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      out.push(d.toLocaleDateString('en-GB', { weekday: 'narrow' }).toUpperCase());
    }
    return out;
  })();
</script>

<main class="dash">
  <header class="bar">
    <BackToDashboard />
    <span class="title-meta">CLIMATE & HOME</span>
  </header>

  <header class="masthead">
    <span class="title">Climate &amp; home</span>
    <span class="subtitle">CURRENT · HEAT PUMP · ROOM CONTROLS</span>
  </header>

  <DashboardGrid columns={12} rows="auto 1fr">
    <Cell w={6}><ClimateTile climate={dummy.climate} /></Cell>
    <Cell w={3}><SleepSackTile sack={dummy.sleepSack} /></Cell>
    <Cell w={3}><BinDayTile binDay={dummy.binDay} /></Cell>

    <Cell w={6}><RoomsList rooms={dummy.climate.rooms} /></Cell>
    <Cell w={6}>
      <RuntimeBars
        data={dummy.climate.runtimeWeek}
        labels={weekLabels}
        highlightIndex={dummy.climate.runtimeWeek.length - 1}
      />
    </Cell>
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
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
  }
  .title-meta {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.22em;
    color: var(--ink);
    text-transform: uppercase;
  }
  .masthead {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: 16px;
    border-bottom: var(--border-normal) solid var(--ink);
    gap: 16px;
  }
  .title {
    font-family: var(--font-serif);
    font-weight: 600;
    font-size: 60px;
    line-height: 1.05;
    color: var(--ink);
  }
  .subtitle {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.22em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
</style>

<script lang="ts">
  import BackToDashboard from '$lib/components/BackToDashboard.svelte';
  import StatusBar from '$lib/components/StatusBar.svelte';
  import DashboardGrid from '$lib/components/DashboardGrid.svelte';
  import Cell from '$lib/components/Cell.svelte';

  import ClimateControl from '$lib/components/ClimateControl.svelte';
  import RoomTempTiles from '$lib/components/RoomTempTiles.svelte';
  import RuntimeBars from '$lib/components/RuntimeBars.svelte';
  import SleepSackTile from '$lib/components/SleepSackTile.svelte';

  import { untrack } from 'svelte';
  import { dummy } from '$lib/dummy';
  import { sendClimateCommand, type ClimateState, type ClimateCommand } from '$lib/api';
  import type { RoomTemp } from './+page';

  let { data }: {
    data: {
      climate: ClimateState | null;
      rooms: RoomTemp[];
      history: { t: string; v: number }[];
      energy: { day: string; label: string; kwh: number }[];
      energyUnit: string;
    };
  } = $props();

  // Authoritative climate state, mutated optimistically on control.
  let climate = $state<ClimateState | null>(untrack(() => data.climate));
  $effect(() => {
    climate = data.climate;
  });

  async function command(cmd: ClimateCommand) {
    if (!climate) return;
    const prev = climate;
    const opt: ClimateState = { ...climate };
    if (cmd.command === 'set_temperature') opt.target_temperature = cmd.value;
    else if (cmd.command === 'set_fan_mode') opt.fan_mode = cmd.value;
    else if (cmd.command === 'turn_off') {
      opt.on = false;
      opt.hvac_mode = 'off';
      opt.hvac_action = 'off';
    } else if (cmd.command === 'turn_on') opt.on = true;
    climate = opt;
    try {
      climate = await sendClimateCommand(prev.entity_id, cmd);
    } catch {
      climate = prev; // revert on failure
    }
  }

  // Sleep-sack advice, with the room-low wired to Nico's live temperature.
  let nicoTemp = $derived(data.rooms.find((r) => r.label === "Nico's room")?.value ?? null);
  let sack = $derived({
    ...dummy.sleepSack,
    roomLow: nicoTemp ?? dummy.sleepSack.roomLow,
  });

  let energyValues = $derived(data.energy.map((d) => d.kwh));
  let energyLabels = $derived(data.energy.map((d) => d.label));
</script>

<main class="dash">
  <header class="bar">
    <BackToDashboard />
    <span class="title-meta">CLIMATE &amp; HOME</span>
  </header>

  <header class="masthead">
    <span class="title">Climate &amp; home</span>
    <span class="subtitle">LIVING ROOM CONTROL · ROOM TEMPS · ENERGY</span>
  </header>

  <DashboardGrid columns={12} rows="auto 1fr">
    <Cell w={7}>
      {#if climate}
        <ClimateControl {climate} history={data.history} onCommand={command} />
      {:else}
        <div class="offline">Heat pump unavailable</div>
      {/if}
    </Cell>
    <Cell w={5}><RoomTempTiles rooms={data.rooms} /></Cell>

    <Cell w={7}>
      {#if energyValues.length}
        <RuntimeBars
          data={energyValues}
          labels={energyLabels}
          highlightIndex={energyValues.length - 1}
          unit=""
          title="Heat pump energy"
          meta={`LAST 7 DAYS · ${data.energyUnit}/DAY`}
        />
      {:else}
        <div class="offline">Energy data unavailable</div>
      {/if}
    </Cell>
    <Cell w={5}><SleepSackTile {sack} /></Cell>
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
    height: 100vh;
    overflow: hidden;
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
  .offline {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
    min-height: 120px;
    border: var(--border-normal) solid var(--hairline);
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.18em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
</style>

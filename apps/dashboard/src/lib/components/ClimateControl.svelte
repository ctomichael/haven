<script lang="ts">
  import { untrack } from 'svelte';
  import { Minus, Plus, ChevronLeft, ChevronRight, Flame } from 'lucide-svelte';
  import WidgetFrame from './WidgetFrame.svelte';
  import Switch from './Switch.svelte';
  import Sparkline from './Sparkline.svelte';
  import type { ClimateState, ClimateCommand, HaHistoryPoint } from '$lib/api';

  let {
    climate,
    history = [],
    onCommand,
  }: {
    climate: ClimateState;
    history?: HaHistoryPoint[];
    onCommand: (cmd: ClimateCommand) => void;
  } = $props();

  // Local mirror of the target so +/- feels instant; the actual set_temperature
  // is debounced so a burst of taps sends one command.
  let target = $state(untrack(() => climate.target_temperature ?? 20));
  let tempTimer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    // Re-sync when the authoritative target changes.
    target = climate.target_temperature ?? target;
  });

  const clamp = (v: number) => Math.min(Math.max(v, climate.min_temp), climate.max_temp);

  function bump(dir: number) {
    if (!climate.available) return;
    const next = clamp(target + dir * climate.step);
    if (next === target) return;
    target = next;
    clearTimeout(tempTimer);
    tempTimer = setTimeout(() => onCommand({ command: 'set_temperature', value: target }), 500);
  }

  function cycleFan(dir: number) {
    if (!climate.available || climate.fan_modes.length === 0) return;
    let i = climate.fan_modes.indexOf(climate.fan_mode ?? '');
    if (i < 0) i = 0;
    i = (i + dir + climate.fan_modes.length) % climate.fan_modes.length;
    onCommand({ command: 'set_fan_mode', value: climate.fan_modes[i]! });
  }

  function togglePower() {
    onCommand({ command: climate.on ? 'turn_off' : 'turn_on' });
  }

  let sparkData = $derived(history.map((p) => p.v));
  let fanLabel = $derived((climate.fan_mode ?? '—').replace(/_/g, ' ').toUpperCase());
  let heating = $derived(climate.hvac_action === 'heating');

  let status = $derived(
    !climate.available
      ? 'UNAVAILABLE'
      : !climate.on
        ? 'OFF'
        : climate.hvac_action === 'heating'
          ? `HEATING → ${target}°`
          : climate.hvac_action === 'cooling'
            ? `COOLING → ${target}°`
            : `${(climate.hvac_action ?? climate.hvac_mode).toUpperCase()} · ${climate.hvac_mode.toUpperCase()}`,
  );
</script>

<WidgetFrame title="Living room" live meta="HEAT PUMP">
  <div class="head">
    <div class="current">
      <span class="value">{climate.current_temperature ?? '—'}</span>
      <span class="unit">°C</span>
    </div>
    <div class="power">
      <span class="power-label">{climate.on ? 'ON' : 'OFF'}</span>
      <Switch on={climate.on} onchange={togglePower} disabled={!climate.available} label="Power" />
    </div>
  </div>

  <div class="status" class:heating>
    {#if heating}<Flame size={16} strokeWidth={2.5} />{/if}
    {status}
  </div>

  <div class="controls">
    <div class="ctl">
      <span class="ctl-label">Set</span>
      <div class="stepper">
        <button onclick={() => bump(-1)} disabled={!climate.available} aria-label="Lower target">
          <Minus size={22} strokeWidth={2.5} />
        </button>
        <span class="reading">{target}°</span>
        <button onclick={() => bump(1)} disabled={!climate.available} aria-label="Raise target">
          <Plus size={22} strokeWidth={2.5} />
        </button>
      </div>
    </div>

    <div class="ctl">
      <span class="ctl-label">Fan</span>
      <div class="stepper">
        <button onclick={() => cycleFan(-1)} disabled={!climate.available} aria-label="Slower fan">
          <ChevronLeft size={22} strokeWidth={2.5} />
        </button>
        <span class="reading fan">{fanLabel}</span>
        <button onclick={() => cycleFan(1)} disabled={!climate.available} aria-label="Faster fan">
          <ChevronRight size={22} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  </div>

  {#if sparkData.length >= 2}
    <div class="chart">
      <span class="chart-label">Room · last 24h</span>
      <div class="spark"><Sparkline data={sparkData} fill /></div>
    </div>
  {/if}
</WidgetFrame>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 18px;
  }
  .current {
    display: flex;
    align-items: baseline;
    gap: 6px;
  }
  .current .value {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 64px;
    line-height: 0.9;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .current .unit {
    font-family: var(--font-serif);
    font-weight: 500;
    font-size: 26px;
    color: var(--ink);
  }
  .power {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }
  .power-label {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.2em;
    color: var(--muted-mono);
  }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    letter-spacing: 0.18em;
    color: var(--muted-mono);
    text-transform: uppercase;
  }
  .status.heating {
    color: var(--ink);
  }
  .controls {
    display: flex;
    gap: 16px;
  }
  .ctl {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ctl-label {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 12px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted-mono);
  }
  .stepper {
    display: grid;
    grid-template-columns: 52px 1fr 52px;
    align-items: stretch;
    border: var(--border-normal) solid var(--ink);
  }
  .stepper button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 52px;
    border: 0;
    background: var(--paper);
    color: var(--ink);
    cursor: pointer;
  }
  .stepper button:first-child {
    border-right: var(--border-normal) solid var(--ink);
  }
  .stepper button:last-child {
    border-left: var(--border-normal) solid var(--ink);
  }
  .stepper button:disabled {
    color: var(--disabled);
    cursor: default;
  }
  .reading {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 30px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
  }
  .reading.fan {
    font-size: 15px;
    letter-spacing: 0.08em;
  }
  .chart {
    margin-top: 4px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .chart-label {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: var(--muted-mono);
  }
  .spark {
    height: 120px;
    color: var(--ink);
  }
</style>

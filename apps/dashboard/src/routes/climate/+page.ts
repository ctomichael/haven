import type { PageLoad } from './$types';
import {
  fetchClimate,
  fetchHaHistory,
  fetchEnergyDaily,
  type ClimateState,
  type EnergyDay,
  type HaHistoryPoint,
} from '$lib/api';
import {
  CLIMATE_ENTITY,
  LIVING_ROOM_TEMP,
  ENERGY_ENTITY,
  ROOM_TEMPS,
} from '$lib/climate';

// Each room tile shows its last-4h trend + current value, both derived from
// one history call.
export type RoomTemp = { label: string; value: number | null; unit: string; history: number[] };

export const load: PageLoad = async ({ fetch }) => {
  const [climate, history, energy, ...roomHistories] = await Promise.all([
    fetchClimate(CLIMATE_ENTITY, fetch).catch(() => null),
    fetchHaHistory(LIVING_ROOM_TEMP, 24, fetch).catch(() => null),
    fetchEnergyDaily(ENERGY_ENTITY, 7, fetch).catch(() => null),
    ...ROOM_TEMPS.map((r) => fetchHaHistory(r.entity, 4, fetch).catch(() => null)),
  ]);

  const rooms: RoomTemp[] = ROOM_TEMPS.map((r, i) => {
    const pts = roomHistories[i]?.points ?? [];
    const last = pts.length ? pts[pts.length - 1]!.v : null;
    return {
      label: r.label,
      value: last != null ? Math.round(last * 10) / 10 : null,
      unit: roomHistories[i]?.unit ?? '°C',
      history: pts.map((p) => p.v),
    };
  });

  return {
    climate: climate as ClimateState | null,
    rooms,
    history: (history?.points ?? []) as HaHistoryPoint[],
    energy: (energy?.days ?? []) as EnergyDay[],
    energyUnit: energy?.unit ?? 'kWh',
  };
};

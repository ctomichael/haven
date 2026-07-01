import type { PageLoad } from './$types';
import {
  fetchClimate,
  fetchHaEntities,
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

export type RoomTemp = { label: string; value: number | null; unit: string };

export const load: PageLoad = async ({ fetch }) => {
  const [climate, entities, history, energy] = await Promise.all([
    fetchClimate(CLIMATE_ENTITY, fetch).catch(() => null),
    fetchHaEntities(
      ROOM_TEMPS.map((r) => r.entity),
      fetch,
    ).catch(() => null),
    fetchHaHistory(LIVING_ROOM_TEMP, 24, fetch).catch(() => null),
    fetchEnergyDaily(ENERGY_ENTITY, 7, fetch).catch(() => null),
  ]);

  const rooms: RoomTemp[] = ROOM_TEMPS.map((r) => {
    const e = entities?.find((x) => x.entity_id === r.entity);
    const n = e ? Number(e.state) : NaN;
    return {
      label: r.label,
      value: Number.isFinite(n) ? Math.round(n * 10) / 10 : null,
      unit: e?.unit ?? '°C',
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

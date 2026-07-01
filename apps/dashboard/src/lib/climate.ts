// Entities that drive the /climate screen. Central so the loader + widgets
// agree, and so re-pointing at different HA entities is a one-file change.

// The controllable heat-pump (living room). Must also be in the backend's
// HAVEN_HA_CLIMATE_ENTITIES allowlist for control to work.
export const CLIMATE_ENTITY = 'climate.mitsubishi_heatpump';

// Temperature sensor charted inside the living-room control widget.
export const LIVING_ROOM_TEMP = 'sensor.living_room_climate_temperature';

// Cumulative energy counter → daily kWh "runtime" bars.
export const ENERGY_ENTITY = 'sensor.mitsubishi_heatpump_measured_cumulative_power_consumption';

// Read-only room temperatures (no controls — these rooms have no switch).
export const ROOM_TEMPS: { label: string; entity: string }[] = [
  { label: 'Living room', entity: 'sensor.living_room_climate_temperature' },
  { label: 'Bedroom', entity: 'sensor.master_bedroom_climate_temperature' },
  { label: "Nico's room", entity: 'sensor.nico_climate_temperature' },
  { label: 'Outdoor', entity: 'sensor.mitsubishi_heatpump_measured_outdoor_air_temperature' },
];

export const NICO_TEMP = 'sensor.nico_climate_temperature';

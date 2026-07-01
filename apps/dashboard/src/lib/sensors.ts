// Which HA entities feed the three dashboard temperature tiles, in order.
// Shared by the page loader (to fetch current values) and the page component
// (to know which entity a tapped tile should chart). Moves into a widget
// manifest once that system lands.

export type SensorTileConfig = { label: string; entity: string };

export const SENSOR_TILES: SensorTileConfig[] = [
  { label: 'Living room', entity: 'sensor.living_room_climate_temperature' },
  { label: 'Bedroom', entity: 'sensor.master_bedroom_climate_temperature' },
  { label: "Nico's room", entity: 'sensor.nico_climate_temperature' },
];

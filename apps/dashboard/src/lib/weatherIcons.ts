import type { ComponentType } from 'svelte';
import {
  Sun,
  Moon,
  Cloud,
  CloudSun,
  CloudRain,
  CloudDrizzle,
  CloudSnow,
  Snowflake,
  CloudFog,
  CloudLightning,
  Wind,
} from 'lucide-svelte';

// Map a MetService condition word (Fine, Frost, Few showers, Snow, …) to a
// lucide icon. Order matters — more specific words are matched first.
export function weatherIcon(label: string): ComponentType {
  const l = label.toLowerCase();
  if (l.includes('thunder')) return CloudLightning;
  if (l.includes('snow')) return CloudSnow;
  if (l.includes('frost')) return Snowflake;
  if (l.includes('drizzle')) return CloudDrizzle;
  if (l.includes('shower') || l.includes('rain')) return CloudRain;
  if (l.includes('fog') || l.includes('mist')) return CloudFog;
  if (l.includes('wind')) return Wind;
  if (l.includes('part') || l.includes('few')) return CloudSun;
  if (l.includes('cloud') || l.includes('overcast')) return Cloud;
  if (l.includes('clear')) return Moon;
  return Sun; // Fine / Sunny / fallback
}

import { Hono } from 'hono';

// Weather, sourced from MetService's undocumented publicData endpoints.
//
// ⚠️  Licensing: every MetService payload carries
//     "_usage": "This data is restricted and may only be used with explicit
//      permission from MetService NZ. Contact dataenquiries@metservice.com"
//     This is fine-ish for a single private household dashboard but is NOT a
//     licensed/public API. If this ever needs to be above-board, switch to
//     the official keyed Point Forecast API (developer.metservice.com) or a
//     CC-licensed source like Open-Meteo — the response shape below is the
//     only thing the dashboard depends on, so swapping the source is local
//     to this file.
//
// Town is configurable via HAVEN_WEATHER_TOWN (default Queenstown). The town
// slug is inserted into the endpoint names verbatim, capitalised as MetService
// expects (e.g. localObs_Queenstown, localForecastQueenstown).

const TOWN = process.env.HAVEN_WEATHER_TOWN ?? 'Queenstown';
const BASE = 'https://www.metservice.com/publicData';
const UA =
  'Haven household dashboard (private, non-commercial; contact via repo owner)';
const CACHE_TTL_MS = 15 * 60 * 1000; // MetService obs refresh ~3-hourly; 15m is plenty.
const FETCH_TIMEOUT_MS = 10_000;

export type ForecastDay = {
  day: string; // "TUE"
  high: number;
  low: number;
  label: string;
};

export type WeatherPayload = {
  city: string;
  currentTemp: number;
  currentLabel: string;
  observedAt: string | null; // ISO from the obs station
  source: string;
  forecast: ForecastDay[];
};

// --- MetService response shapes (only the fields we read) --------------

type LocalObs = {
  location?: string;
  threeHour?: {
    temp?: string | number;
    dateTimeISO?: string;
  };
};

type PartDay = { forecastWord?: string };
type LocalForecast = {
  days?: Array<{
    dowTLA?: string;
    max?: string | number;
    min?: string | number;
    forecastWord?: string;
    partDayData?: {
      morning?: PartDay;
      afternoon?: PartDay;
      evening?: PartDay;
      overnight?: PartDay;
    };
  }>;
};

async function getJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'user-agent': UA, accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function toNumber(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// Pick the forecast word for the current part of the day, using the hour
// embedded in the obs ISO timestamp (already NZ-local with offset). Falls
// back to the day's overall forecastWord.
function currentLabelFrom(
  forecast: LocalForecast,
  obsISO: string | undefined,
): string {
  const today = forecast.days?.[0];
  if (!today) return '—';
  const hour = obsISO ? Number(obsISO.slice(11, 13)) : NaN;
  const pd = today.partDayData;
  let part: PartDay | undefined;
  if (pd && Number.isFinite(hour)) {
    if (hour >= 5 && hour < 12) part = pd.morning;
    else if (hour >= 12 && hour < 18) part = pd.afternoon;
    else if (hour >= 18 && hour < 22) part = pd.evening;
    else part = pd.overnight;
  }
  return part?.forecastWord ?? today.forecastWord ?? '—';
}

function mapForecast(forecast: LocalForecast): ForecastDay[] {
  const days = forecast.days ?? [];
  return days
    .slice(0, 3)
    .map((d) => {
      const high = toNumber(d.max);
      const low = toNumber(d.min);
      if (high === null || low === null || !d.dowTLA) return null;
      return {
        day: d.dowTLA.toUpperCase(),
        high,
        low,
        label: d.forecastWord ?? '—',
      };
    })
    .filter((d): d is ForecastDay => d !== null);
}

async function buildPayload(): Promise<WeatherPayload> {
  const [obs, forecast] = await Promise.all([
    getJson<LocalObs>(`${BASE}/localObs_${TOWN}`),
    getJson<LocalForecast>(`${BASE}/localForecast${TOWN}`),
  ]);

  const currentTemp = toNumber(obs.threeHour?.temp);
  if (currentTemp === null) {
    throw new Error('MetService obs missing current temperature');
  }

  return {
    city: TOWN.toUpperCase(),
    currentTemp,
    currentLabel: currentLabelFrom(forecast, obs.threeHour?.dateTimeISO),
    observedAt: obs.threeHour?.dateTimeISO ?? null,
    source: 'MetService',
    forecast: mapForecast(forecast),
  };
}

// --- Simple TTL cache so we don't hammer MetService on every page load --

let cache: { at: number; payload: WeatherPayload } | null = null;
let inflight: Promise<WeatherPayload> | null = null;

async function getWeather(): Promise<WeatherPayload> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_TTL_MS) return cache.payload;
  if (inflight) return inflight;
  inflight = buildPayload()
    .then((payload) => {
      cache = { at: Date.now(), payload };
      return payload;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const weather = new Hono();

weather.get('/', async (c) => {
  try {
    const payload = await getWeather();
    // Let the SSR loader and any CDN cache for a few minutes.
    c.header('cache-control', 'public, max-age=300');
    return c.json(payload);
  } catch (e) {
    // Serve stale cache rather than nothing if MetService is flaky.
    if (cache) {
      c.header('x-haven-weather-stale', '1');
      return c.json(cache.payload);
    }
    return c.json(
      { error: 'weather_unavailable', detail: e instanceof Error ? e.message : String(e) },
      502,
    );
  }
});

export default weather;

/**
 * Open-Meteo data client.
 *
 * Free, no API key, CORS-enabled. Single endpoint:
 *   https://api.open-meteo.com/v1/forecast
 *
 * Two responsibilities, one per exported function:
 *   - {@link fetchOpenMeteo}: raw HTTP call, typed response.
 *   - {@link shapeHourly}: split the hourly arrays into a 24h history
 *     window and a 24h forecast window, keyed off "now".
 *
 * Tests inject `fetch` so we never hit the live API in CI.
 */

import type { HourRecord } from '@/model/drying.ts';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** Hour record with the extra fields the UI / run-mode score need but the model ignores. */
export interface WeatherHour extends HourRecord {
  /** Probability of precipitation, 0–100. */
  readonly precipProb: number;
  /** Apparent (feels-like) temperature in °C. */
  readonly apparentTemp: number;
}

/** Output of {@link shapeHourly}. */
export interface ShapedWeather {
  /** Up to 24 most recent hours, including the current hour. */
  readonly history: readonly WeatherHour[];
  /** Up to 24 strictly-future hours. */
  readonly forecast: readonly WeatherHour[];
  /** Open-Meteo "current" snapshot, if present. */
  readonly current: OpenMeteoCurrent | null;
}

// ---------------------------------------------------------------------------
// Open-Meteo response shape (only the fields we request)
// ---------------------------------------------------------------------------

export interface OpenMeteoHourly {
  /** Local-time ISO strings, no TZ marker (e.g. "2026-04-26T16:00"). */
  time?: readonly string[];
  temperature_2m?: readonly number[];
  apparent_temperature?: readonly number[];
  relative_humidity_2m?: readonly number[];
  precipitation?: readonly number[];
  rain?: readonly number[];
  cloud_cover?: readonly number[];
  wind_speed_10m?: readonly number[];
  /** 0 or 1; we cast to boolean. */
  is_day?: readonly number[];
  precipitation_probability?: readonly number[];
}

export interface OpenMeteoCurrent {
  time?: string;
  temperature_2m?: number;
  apparent_temperature?: number;
  relative_humidity_2m?: number;
  precipitation?: number;
  rain?: number;
  wind_speed_10m?: number;
  cloud_cover?: number;
  is_day?: number;
}

export interface OpenMeteoResponse {
  latitude?: number;
  longitude?: number;
  timezone?: string;
  utc_offset_seconds?: number;
  hourly?: OpenMeteoHourly;
  current?: OpenMeteoCurrent;
}

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

export const OPEN_METEO_BASE_URL = 'https://api.open-meteo.com/v1/forecast';

const HOURLY_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation',
  'rain',
  'cloud_cover',
  'wind_speed_10m',
  'is_day',
  'precipitation_probability',
] as const;

const CURRENT_FIELDS = [
  'temperature_2m',
  'apparent_temperature',
  'relative_humidity_2m',
  'precipitation',
  'rain',
  'wind_speed_10m',
  'cloud_cover',
  'is_day',
] as const;

export function buildOpenMeteoUrl(lat: number, lon: number): string {
  const params = new URLSearchParams({
    latitude: lat.toString(),
    longitude: lon.toString(),
    hourly: HOURLY_FIELDS.join(','),
    current: CURRENT_FIELDS.join(','),
    timezone: 'auto',
    past_days: '1',
    forecast_days: '2',
    wind_speed_unit: 'kmh',
  });
  return `${OPEN_METEO_BASE_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

/**
 * Fetch a forecast from Open-Meteo. `fetchImpl` is injectable for tests.
 *
 * @throws if the response is non-2xx.
 */
export async function fetchOpenMeteo(
  lat: number,
  lon: number,
  fetchImpl: typeof fetch = fetch,
): Promise<OpenMeteoResponse> {
  const url = buildOpenMeteoUrl(lat, lon);
  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo HTTP ${response.status}`);
  }
  return (await response.json()) as OpenMeteoResponse;
}

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

/**
 * Split the raw hourly arrays into a history (≤ now) and forecast (> now)
 * window, both up to 24 hours long.
 *
 * Time strings are parsed as **local time of the runtime** because Open-Meteo
 * returns wall-clock without a TZ marker when called with `timezone=auto`.
 * For NYC users querying NYC locations this is correct; cross-timezone use
 * needs a follow-up.
 */
export function shapeHourly(
  raw: OpenMeteoResponse,
  now: Date = new Date(),
): ShapedWeather {
  const h = raw.hourly;
  if (!h || !h.time || h.time.length === 0) {
    return { history: [], forecast: [], current: raw.current ?? null };
  }

  const records: WeatherHour[] = h.time.map((t, i) => {
    const temp = h.temperature_2m?.[i] ?? 0;
    return {
      time: new Date(t),
      rain_mm: h.rain?.[i] ?? h.precipitation?.[i] ?? 0,
      temp,
      humid: h.relative_humidity_2m?.[i] ?? 50,
      clouds: h.cloud_cover?.[i] ?? 50,
      wind: h.wind_speed_10m?.[i] ?? 0,
      isDay: (h.is_day?.[i] ?? 1) > 0,
      precipProb: h.precipitation_probability?.[i] ?? 0,
      apparentTemp: h.apparent_temperature?.[i] ?? temp,
    };
  });

  const nowMs = now.getTime();
  let nowIdx = -1;
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    if (!r) continue;
    if (r.time.getTime() <= nowMs) nowIdx = i;
    else break;
  }
  if (nowIdx < 0) nowIdx = 0;

  const history = records.slice(Math.max(0, nowIdx - 23), nowIdx + 1);
  const forecast = records.slice(nowIdx + 1, nowIdx + 1 + 24);
  return { history, forecast, current: raw.current ?? null };
}

// ---------------------------------------------------------------------------
// Convenience: fetch + shape
// ---------------------------------------------------------------------------

export interface GetWeatherOptions {
  /** Override the global fetch (tests). */
  readonly fetch?: typeof fetch;
  /** Override "now" for deterministic shaping (tests). */
  readonly now?: Date;
}

export async function getWeather(
  lat: number,
  lon: number,
  options: GetWeatherOptions = {},
): Promise<ShapedWeather> {
  const raw = await fetchOpenMeteo(lat, lon, options.fetch);
  return shapeHourly(raw, options.now);
}

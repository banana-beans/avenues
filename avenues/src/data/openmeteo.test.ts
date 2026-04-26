import { describe, expect, it, vi } from 'vitest';

import {
  buildOpenMeteoUrl,
  fetchOpenMeteo,
  getWeather,
  OPEN_METEO_BASE_URL,
  shapeHourly,
  type OpenMeteoResponse,
} from './openmeteo.ts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Format a Date in local-time ISO without TZ marker, matching Open-Meteo's
 * `timezone=auto` output. `new Date(localISO(d))` round-trips back to `d`.
 */
function localISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:00`;
}

function hoursAround(now: Date, before: number, after: number): string[] {
  const out: string[] = [];
  for (let i = -before; i <= after; i++) {
    out.push(localISO(new Date(now.getTime() + i * 3_600_000)));
  }
  return out;
}

function fillSeries<T>(value: T, length: number): T[] {
  return Array.from({ length }, () => value);
}

function mockOkResponse(body: OpenMeteoResponse): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function mockErrorResponse(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({}),
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// URL construction
// ---------------------------------------------------------------------------

describe('buildOpenMeteoUrl', () => {
  it('points at the Open-Meteo forecast endpoint', () => {
    const url = buildOpenMeteoUrl(40.6262, -74.0327);
    expect(url.startsWith(OPEN_METEO_BASE_URL)).toBe(true);
  });

  it('encodes lat/lon and required query params', () => {
    const url = buildOpenMeteoUrl(40.6262, -74.0327);
    const parsed = new URL(url);
    expect(parsed.searchParams.get('latitude')).toBe('40.6262');
    expect(parsed.searchParams.get('longitude')).toBe('-74.0327');
    expect(parsed.searchParams.get('past_days')).toBe('1');
    expect(parsed.searchParams.get('forecast_days')).toBe('2');
    expect(parsed.searchParams.get('timezone')).toBe('auto');
    expect(parsed.searchParams.get('wind_speed_unit')).toBe('kmh');
  });

  it('requests the hourly fields the model needs', () => {
    const url = buildOpenMeteoUrl(40, -74);
    const hourly = new URL(url).searchParams.get('hourly') ?? '';
    expect(hourly).toContain('temperature_2m');
    expect(hourly).toContain('relative_humidity_2m');
    expect(hourly).toContain('precipitation');
    expect(hourly).toContain('rain');
    expect(hourly).toContain('cloud_cover');
    expect(hourly).toContain('wind_speed_10m');
    expect(hourly).toContain('is_day');
    expect(hourly).toContain('precipitation_probability');
  });
});

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

describe('fetchOpenMeteo', () => {
  it('returns the parsed JSON body on success', async () => {
    const body: OpenMeteoResponse = { latitude: 40, longitude: -74 };
    const mockFetch = vi.fn().mockResolvedValue(mockOkResponse(body));

    const result = await fetchOpenMeteo(40, -74, mockFetch);

    expect(result).toEqual(body);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockFetch.mock.calls[0]?.[0]).toContain('latitude=40');
  });

  it('throws on a non-2xx response, including the status code', async () => {
    const mockFetch = vi.fn().mockResolvedValue(mockErrorResponse(503));
    await expect(fetchOpenMeteo(40, -74, mockFetch)).rejects.toThrow(/503/);
  });
});

// ---------------------------------------------------------------------------
// Shaping
// ---------------------------------------------------------------------------

describe('shapeHourly', () => {
  const NOW = new Date('2026-04-26T12:00:00');

  it('returns empty arrays when hourly is missing', () => {
    const result = shapeHourly({}, NOW);
    expect(result.history).toEqual([]);
    expect(result.forecast).toEqual([]);
    expect(result.current).toBeNull();
  });

  it('returns empty arrays when hourly.time is empty', () => {
    const result = shapeHourly({ hourly: { time: [] } }, NOW);
    expect(result.history).toEqual([]);
    expect(result.forecast).toEqual([]);
  });

  it('preserves the current snapshot when present', () => {
    const result = shapeHourly(
      { hourly: { time: [] }, current: { temperature_2m: 18 } },
      NOW,
    );
    expect(result.current).toEqual({ temperature_2m: 18 });
  });

  it('splits records into history (≤ now) and forecast (> now)', () => {
    const time = hoursAround(NOW, 24, 24); // 49 records: 24 before, now, 24 after
    const length = time.length;
    const raw: OpenMeteoResponse = {
      hourly: {
        time,
        temperature_2m: fillSeries(15, length),
        relative_humidity_2m: fillSeries(60, length),
        cloud_cover: fillSeries(40, length),
        wind_speed_10m: fillSeries(10, length),
        is_day: fillSeries(1, length),
        rain: fillSeries(0, length),
      },
    };

    const result = shapeHourly(raw, NOW);

    expect(result.history.length).toBe(24); // capped at 24, including "now"
    expect(result.forecast.length).toBe(24);

    const lastHistory = result.history[result.history.length - 1];
    expect(lastHistory).toBeDefined();
    expect(lastHistory!.time.getTime()).toBe(NOW.getTime());

    const firstForecast = result.forecast[0];
    expect(firstForecast).toBeDefined();
    expect(firstForecast!.time.getTime()).toBe(NOW.getTime() + 3_600_000);
  });

  it('falls back to precipitation when rain array is missing', () => {
    const time = [localISO(NOW)];
    const result = shapeHourly(
      {
        hourly: {
          time,
          precipitation: [1.5],
          temperature_2m: [12],
          relative_humidity_2m: [70],
          cloud_cover: [80],
          wind_speed_10m: [8],
          is_day: [1],
        },
      },
      NOW,
    );
    expect(result.history[0]?.rain_mm).toBe(1.5);
  });

  it('prefers rain over precipitation when both arrays are present', () => {
    const time = [localISO(NOW)];
    const result = shapeHourly(
      {
        hourly: {
          time,
          rain: [2.5],
          precipitation: [99], // should be ignored
          temperature_2m: [12],
          relative_humidity_2m: [70],
          cloud_cover: [80],
          wind_speed_10m: [8],
          is_day: [1],
        },
      },
      NOW,
    );
    expect(result.history[0]?.rain_mm).toBe(2.5);
  });

  it('defaults rain to 0 when neither array is present', () => {
    const time = [localISO(NOW)];
    const result = shapeHourly({ hourly: { time } }, NOW);
    expect(result.history[0]?.rain_mm).toBe(0);
  });

  it('coerces is_day=0 to false and is_day=1 to true', () => {
    const time = hoursAround(NOW, 0, 1);
    const result = shapeHourly(
      {
        hourly: {
          time,
          is_day: [1, 0],
          temperature_2m: [10, 8],
        },
      },
      NOW,
    );
    expect(result.history[0]?.isDay).toBe(true);
    expect(result.forecast[0]?.isDay).toBe(false);
  });

  it('caps history at 24 hours even with more past data', () => {
    const time = hoursAround(NOW, 30, 0); // 31 records, all ≤ now
    const result = shapeHourly({ hourly: { time } }, NOW);
    expect(result.history.length).toBe(24);
    expect(result.forecast.length).toBe(0);
  });

  it('puts every record in history when now is past all of them', () => {
    const wayLater = new Date(NOW.getTime() + 100 * 3_600_000);
    const time = hoursAround(NOW, 0, 5); // 6 records around NOW
    const result = shapeHourly({ hourly: { time } }, wayLater);
    expect(result.history.length).toBe(6);
    expect(result.forecast.length).toBe(0);
  });

  it('puts every record in forecast when now is before all of them', () => {
    const wayEarlier = new Date(NOW.getTime() - 100 * 3_600_000);
    const time = hoursAround(NOW, 0, 5);
    const result = shapeHourly({ hourly: { time } }, wayEarlier);
    // nowIdx clamps to 0, so the first record lands in history.
    expect(result.history.length).toBe(1);
    expect(result.forecast.length).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// getWeather (fetch + shape)
// ---------------------------------------------------------------------------

describe('getWeather', () => {
  it('chains fetchOpenMeteo and shapeHourly with injected fetch + now', async () => {
    const NOW = new Date('2026-04-26T12:00:00');
    const time = hoursAround(NOW, 1, 1);
    const body: OpenMeteoResponse = {
      hourly: {
        time,
        temperature_2m: [10, 12, 14],
        rain: [0.5, 0, 1.0],
      },
    };
    const mockFetch = vi.fn().mockResolvedValue(mockOkResponse(body));

    const result = await getWeather(40, -74, { fetch: mockFetch, now: NOW });

    expect(mockFetch).toHaveBeenCalledOnce();
    expect(result.history.length).toBe(2); // hours -1 and 0 (now)
    expect(result.forecast.length).toBe(1); // hour +1
    expect(result.history[0]?.rain_mm).toBe(0.5);
    expect(result.forecast[0]?.rain_mm).toBe(1.0);
  });
});

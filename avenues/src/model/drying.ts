/**
 * Drying model — estimates surface wetness from hourly weather history.
 *
 * The heart of avenues. See `docs/drying-model.md` for the physics writeup.
 * Coefficients live in `./coefficients.ts`; this module owns the model shape.
 */

import {
  BASE_RATE_PER_HOUR,
  CLOUD_FACTOR,
  HUMIDITY_FACTOR,
  NIGHT_DRYING_FACTOR,
  PAINT_MULTIPLIER,
  PUDDLE_LAST_1H_MM,
  PUDDLE_LAST_3H_MM,
  RESIDUAL_WET_THRESHOLD_MM,
  TEMP_FACTOR,
  TRACE_THRESHOLD_MM,
  WIND_FACTOR,
} from './coefficients.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One hour of weather observation/forecast for a location. */
export interface HourRecord {
  /** Wall-clock time at the start of the hour. */
  readonly time: Date;
  /** Rainfall during this hour, in millimeters. */
  readonly rain_mm: number;
  /** Air temperature, °C. */
  readonly temp: number;
  /** Relative humidity, percent (0–100). */
  readonly humid: number;
  /** Cloud cover, percent (0–100). */
  readonly clouds: number;
  /** Wind speed, kph. */
  readonly wind: number;
  /** Whether the sun is above the horizon during this hour. */
  readonly isDay: boolean;
}

/** Output of the drying model: derived state at the end of the history window. */
export interface EvaluationState {
  /** Asphalt residual water > {@link RESIDUAL_WET_THRESHOLD_MM}. */
  readonly wet: boolean;
  /** Painted-lane residual water > {@link RESIDUAL_WET_THRESHOLD_MM}. */
  readonly paintWet: boolean;
  /** Active precipitation in the most recent hour (≥ {@link TRACE_THRESHOLD_MM}). */
  readonly rainNow: boolean;
  /** Asphalt residual water in mm at the end of the window. */
  readonly residualWaterMm: number;
  /** Painted-lane residual water in mm at the end of the window. */
  readonly residualPaintWaterMm: number;
  /** Hours since the last hour with measurable rain; null if none in window. */
  readonly hoursSinceRainEnded: number | null;
  /** Recent rain heavy enough that puddles likely persist on low spots. */
  readonly puddleLikely: boolean;
  /** Snapshot of the most recent hour, surfaced for downstream scoring. */
  readonly currentTemp: number;
  readonly currentWind: number;
  readonly currentHumid: number;
  readonly currentClouds: number;
}

// ---------------------------------------------------------------------------
// Drying-rate factor functions
// ---------------------------------------------------------------------------

export function tempFactor(tempC: number): number {
  if (tempC <= 0) return TEMP_FACTOR.freezing;
  if (tempC < 5) return TEMP_FACTOR.cold;
  return Math.min(
    TEMP_FACTOR.maxOutput,
    TEMP_FACTOR.baseAt5C + (tempC - 5) * TEMP_FACTOR.slopePerCelsius,
  );
}

export function windFactor(windKph: number): number {
  return Math.min(
    WIND_FACTOR.maxOutput,
    WIND_FACTOR.base + Math.sqrt(Math.max(0, windKph)) / WIND_FACTOR.divisor,
  );
}

export function humidityFactor(humidPct: number): number {
  const raw =
    HUMIDITY_FACTOR.base +
    (humidPct / HUMIDITY_FACTOR.referencePercent) ** HUMIDITY_FACTOR.exponent;
  return Math.max(
    HUMIDITY_FACTOR.minOutput,
    Math.min(HUMIDITY_FACTOR.maxOutput, raw),
  );
}

export function cloudFactor(cloudsPct: number): number {
  return CLOUD_FACTOR.base + (cloudsPct / 100) * CLOUD_FACTOR.slope;
}

/** Hourly drying potential (mm of surface water removed per hour). */
export function dryingRate(
  tempC: number,
  windKph: number,
  humidPct: number,
  cloudsPct: number,
  isDaylight: boolean,
): number {
  const numerator = BASE_RATE_PER_HOUR * tempFactor(tempC) * windFactor(windKph);
  const denominator = humidityFactor(humidPct) * cloudFactor(cloudsPct);
  let rate = numerator / denominator;
  if (!isDaylight) rate *= NIGHT_DRYING_FACTOR;
  return Math.max(0, rate);
}

// ---------------------------------------------------------------------------
// Walk the history window
// ---------------------------------------------------------------------------

/**
 * Compute current wetness state from an hourly history window.
 *
 * @param history Hourly records ordered oldest → newest. The last entry is
 *                treated as "now". Up to 24 hours is the design target.
 * @returns       Derived state, or `null` if the history is empty.
 */
export function evaluate(history: readonly HourRecord[]): EvaluationState | null {
  if (history.length === 0) return null;

  const last = history[history.length - 1];
  if (!last) return null; // unreachable; satisfies noUncheckedIndexedAccess

  let asphaltWaterMm = 0;
  let paintWaterMm = 0;
  let lastRainIndex = -1;

  for (let i = 0; i < history.length; i++) {
    const h = history[i];
    if (!h) continue;

    if (h.rain_mm >= TRACE_THRESHOLD_MM) {
      asphaltWaterMm += h.rain_mm;
      paintWaterMm += h.rain_mm * PAINT_MULTIPLIER;
      lastRainIndex = i;
    } else {
      const rate = dryingRate(h.temp, h.wind, h.humid, h.clouds, h.isDay);
      asphaltWaterMm = Math.max(0, asphaltWaterMm - rate);
      paintWaterMm = Math.max(0, paintWaterMm - rate);
    }
  }

  const last1hRain = sumRecentRain(history, 1);
  const last3hRain = sumRecentRain(history, 3);
  const puddleLikely =
    last1hRain >= PUDDLE_LAST_1H_MM || last3hRain >= PUDDLE_LAST_3H_MM;

  const hoursSinceRainEnded =
    lastRainIndex >= 0 ? history.length - 1 - lastRainIndex : null;

  return {
    wet: asphaltWaterMm > RESIDUAL_WET_THRESHOLD_MM,
    paintWet: paintWaterMm > RESIDUAL_WET_THRESHOLD_MM,
    rainNow: last.rain_mm >= TRACE_THRESHOLD_MM,
    residualWaterMm: asphaltWaterMm,
    residualPaintWaterMm: paintWaterMm,
    hoursSinceRainEnded,
    puddleLikely,
    currentTemp: last.temp,
    currentWind: last.wind,
    currentHumid: last.humid,
    currentClouds: last.clouds,
  };
}

function sumRecentRain(history: readonly HourRecord[], hours: number): number {
  let sum = 0;
  const start = Math.max(0, history.length - hours);
  for (let i = start; i < history.length; i++) {
    const h = history[i];
    if (h) sum += h.rain_mm;
  }
  return sum;
}

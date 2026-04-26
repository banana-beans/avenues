/**
 * Drying-model coefficients.
 *
 * These are empirical, NYC-tuned hyperparameters — not first-principles physics.
 * Treat them as the calibration surface: future ride-log back-fitting will
 * adjust them, the test suite locks current behavior.
 *
 * Do not modify without re-running `pnpm test` and updating expectations.
 */

// ---------------------------------------------------------------------------
// Surface water bookkeeping
// ---------------------------------------------------------------------------

/** Hourly rainfall below this (mm) is treated as zero — sensor noise / fog. */
export const TRACE_THRESHOLD_MM = 0.15;

/** Surface-water residual (mm) above which the road is reported "wet". */
export const RESIDUAL_WET_THRESHOLD_MM = 0.05;

/**
 * Drying potential under standard reference conditions (mm/h):
 * 20°C, 50% RH, 10 kph wind, 0% clouds, daytime.
 */
export const BASE_RATE_PER_HOUR = 0.9;

/**
 * Painted lanes hold ~70% more water than asphalt for the same rainfall:
 * lower porosity (no soak-in), smoother texture (thicker films), and
 * hydrophobic surface energy (water beads instead of spreading thin).
 */
export const PAINT_MULTIPLIER = 1.7;

/** Night drying still happens (convective transfer) but at ~half speed. */
export const NIGHT_DRYING_FACTOR = 0.55;

// ---------------------------------------------------------------------------
// Standing-water (puddle) thresholds
// ---------------------------------------------------------------------------

/** mm of rain in the last hour above which puddles persist on low spots. */
export const PUDDLE_LAST_1H_MM = 5;

/** mm of rain in the last 3 hours above which sustained-rain puddles persist. */
export const PUDDLE_LAST_3H_MM = 15;

// ---------------------------------------------------------------------------
// Factor-function shape parameters
// ---------------------------------------------------------------------------

/**
 * tempFactor(T): linear above 5°C, two flat steps below.
 *   T <= 0     → freezing (no drying, water can refreeze)
 *   0 < T < 5  → cold (suppressed drying)
 *   T >= 5     → base + (T - 5) * slope, capped at maxOutput
 */
export const TEMP_FACTOR = {
  freezing: 0.05,
  cold: 0.3,
  baseAt5C: 0.3,
  slopePerCelsius: 1 / 18,
  maxOutput: 2.5,
} as const;

/**
 * windFactor(W): square-root scaling on wind speed (kph).
 * Boundary-layer mass transfer is sub-linear in wind speed.
 *   factor = base + sqrt(max(0, W)) / divisor, capped at maxOutput
 */
export const WIND_FACTOR = {
  base: 0.5,
  divisor: 3.5,
  maxOutput: 2.5,
} as const;

/**
 * humidityFactor(H): power-law denominator (higher humidity → slower drying).
 *   factor = base + (H / referencePercent) ^ exponent, clamped to [min, max]
 * Calibrated so 50% RH → 1.4, 95% RH → ~2.5, 20% RH → ~0.5.
 */
export const HUMIDITY_FACTOR = {
  base: 0.4,
  referencePercent: 50,
  exponent: 1.4,
  minOutput: 0.4,
  maxOutput: 2.5,
} as const;

/**
 * cloudFactor(C): linear ramp from 1.0 (clear) to 2.0 (overcast).
 * Solar radiation is the dominant pavement-drying energy input.
 *   factor = base + (C / 100) * slope
 */
export const CLOUD_FACTOR = {
  base: 1.0,
  slope: 1.0,
} as const;

// ---------------------------------------------------------------------------
// Score penalties (subtracted from 100)
// ---------------------------------------------------------------------------

export const PENALTY = {
  rainNow: 70,
  puddleLikely: 25,

  /** Surface-wet penalty scales with residual mm: clamp(min, min + perMm * mm, max). */
  surfaceWetMin: 8,
  surfaceWetMax: 35,
  surfaceWetPerMm: 12,

  /** Asphalt dry but painted lanes still wet — common NYC failure mode. */
  paintWetOnly: 12,

  /** Cold + wet (T < threshold) compounds with wet penalty. */
  coldWet: 15,
  coldWetTempThresholdC: 5,

  /** T <= 0 → ice risk regardless of moisture. */
  freezing: 20,
  freezingTempThresholdC: 0,

  /** Forecast precipitation in next 3h: clamp(min, min + perMm * mm, max). */
  rainIncomingMin: 8,
  rainIncomingMax: 25,
  rainIncomingPerMm: 5,
  rainIncomingTriggerMm: 1.0,
  rainIncomingLookaheadHours: 3,

  /** Wind penalties (kph). */
  windHigh: 10,
  windHighThresholdKph: 35,
  windGusty: 5,
  windGustyThresholdKph: 25,
} as const;

// ---------------------------------------------------------------------------
// Run-mode penalties
// ---------------------------------------------------------------------------

/**
 * Running has a different hazard profile than cycling:
 *   - Rain is less of a deal-breaker (no slick painted lanes, slower speed)
 *   - Heat is the dominant hazard (heat-stroke risk via apparent temp)
 *   - Cold + wet is less compounded (you generate body heat at running pace)
 *   - Wind matters less (lower aero load, slower speed)
 *   - Painted-lane wetness is irrelevant (runners don't ride in bike lanes)
 *
 * Apparent temperature thresholds based on NWS / NOAA heat index categories:
 *   < 27°C / 80°F   → safe
 *   27–32°C         → caution (some discomfort)
 *   32–39°C         → extreme caution (cramps + exhaustion possible)
 *   ≥ 39°C / 102°F  → danger (heat stroke risk)
 */
export const RUN_PENALTY = {
  rainNow: 25,
  puddleLikely: 8,

  surfaceWetMin: 4,
  surfaceWetMax: 18,
  surfaceWetPerMm: 6,

  /** Painted-lane wetness ignored for runners — set to 0. */
  paintWetOnly: 0,

  coldWet: 8,
  coldWetTempThresholdC: 5,

  freezing: 15,
  freezingTempThresholdC: 0,

  /** Sub-zero extreme: frostbite risk on exposed skin. */
  coldExtreme: 12,
  coldExtremeThresholdC: -10,

  rainIncomingMin: 4,
  rainIncomingMax: 15,
  rainIncomingPerMm: 3,
  rainIncomingTriggerMm: 1.0,
  rainIncomingLookaheadHours: 3,

  windHigh: 8,
  windHighThresholdKph: 35,
  windGusty: 3,
  windGustyThresholdKph: 25,

  /** Heat penalties keyed off apparent temperature (°C) when available. */
  heatCaution: 10,
  heatCautionThresholdC: 27,
  heatExtreme: 25,
  heatExtremeThresholdC: 32,
  heatDanger: 40,
  heatDangerThresholdC: 39,

  /** Warm + humid = sweat doesn't evaporate. Compounding penalty. */
  humidWarm: 8,
  humidWarmTempThresholdC: 22,
  humidWarmHumidThresholdPct: 75,
} as const;

// ---------------------------------------------------------------------------
// Sweet-spot detection (optimal conditions for each activity)
// ---------------------------------------------------------------------------

/**
 * Empirical "feels-best" envelopes per activity. When conditions land inside
 * the envelope AND the score is already in the "good" band, the verdict copy
 * gets upgraded to acknowledge that this is a *peak* day rather than just
 * an OK one.
 *
 * Sources:
 *   - El Helou et al. 2012 (Marathons): optimal ~7–12°C
 *   - Galloway & Maughan: humidity > 70% impairs sweat evaporation
 *   - Cyclists self-cool via airflow → tolerate slightly warmer ambients
 */
export const SWEET_SPOT = {
  run: {
    tempMinC: 5,
    tempMaxC: 12,
    humidMaxPct: 60,
    windMaxKph: 15,
    cloudMinPct: 20,
    cloudMaxPct: 70,
  },
  bike: {
    tempMinC: 12,
    tempMaxC: 22,
    humidMaxPct: 65,
    windMaxKph: 18,
  },
} as const;

// ---------------------------------------------------------------------------
// Score → band mapping
// ---------------------------------------------------------------------------

export const BAND_THRESHOLD = {
  good: 85,
  fair: 65,
  poor: 40,
} as const;

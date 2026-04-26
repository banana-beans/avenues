/**
 * Score function — converts {@link EvaluationState} + forecast into a
 * 0-100 rideability/runnability score, a band, and a plain-English verdict.
 *
 * Two modes: `bike` (cyclists) and `run` (runners). Same drying model feeds
 * both; the penalty weights and copy diverge per the activity hazard profile.
 */

import { BAND_THRESHOLD, PENALTY, RUN_PENALTY, SWEET_SPOT } from './coefficients.ts';
import type { EvaluationState } from './drying.ts';
import type { Mode } from '@/storage/types.ts';

export type Band = 'good' | 'fair' | 'poor' | 'bad';

export interface ScoreResult {
  /** 0–100, integer. */
  readonly score: number;
  readonly band: Band;
  readonly headline: string;
  readonly body: string;
  readonly reasons: readonly string[];
  /**
   * True when conditions land inside the empirical "feels-best" envelope for
   * the chosen mode. Only meaningful when `band === 'good'`.
   */
  readonly sweetSpot: boolean;
}

/** Minimal forecast slice the score function needs. */
export interface ForecastHour {
  readonly rain_mm: number;
}

export interface ScoreOptions {
  readonly mode?: Mode;
  /** Apparent (feels-like) temperature in °C — required for run heat penalties. */
  readonly apparentTempC?: number;
}

export function score(
  state: EvaluationState,
  forecast: readonly ForecastHour[] = [],
  options: ScoreOptions = {},
): ScoreResult {
  if (options.mode === 'run') {
    return scoreRun(state, forecast, options.apparentTempC);
  }
  return scoreBike(state, forecast);
}

function scoreBike(
  state: EvaluationState,
  forecast: readonly ForecastHour[],
): ScoreResult {
  let s = 100;
  const reasons: string[] = [];

  if (state.rainNow) {
    s -= PENALTY.rainNow;
    reasons.push('actively raining');
  }

  if (state.puddleLikely) {
    s -= PENALTY.puddleLikely;
    reasons.push('puddles likely on low spots');
  }

  if (state.wet && !state.rainNow) {
    const penalty = Math.min(
      PENALTY.surfaceWetMax,
      PENALTY.surfaceWetMin + state.residualWaterMm * PENALTY.surfaceWetPerMm,
    );
    s -= penalty;
    const hr = state.hoursSinceRainEnded;
    reasons.push(`damp${hr != null ? ` (rain ended ${hr}h ago)` : ''}`);
  } else if (state.paintWet && !state.rainNow) {
    s -= PENALTY.paintWetOnly;
    reasons.push('asphalt dry but painted lanes still slick');
  }

  if (
    state.currentTemp < PENALTY.coldWetTempThresholdC &&
    (state.wet || state.paintWet)
  ) {
    s -= PENALTY.coldWet;
    reasons.push('cold + wet (ice risk near freezing)');
  }
  if (state.currentTemp <= PENALTY.freezingTempThresholdC) {
    s -= PENALTY.freezing;
    reasons.push('freezing — ice risk');
  }

  const next3hRain = forecast
    .slice(0, PENALTY.rainIncomingLookaheadHours)
    .reduce((sum, f) => sum + (f.rain_mm || 0), 0);
  if (next3hRain >= PENALTY.rainIncomingTriggerMm && !state.rainNow) {
    const penalty = Math.min(
      PENALTY.rainIncomingMax,
      PENALTY.rainIncomingMin + next3hRain * PENALTY.rainIncomingPerMm,
    );
    s -= penalty;
    reasons.push(`rain incoming (${next3hRain.toFixed(1)}mm in next 3h)`);
  }

  if (state.currentWind > PENALTY.windHighThresholdKph) {
    s -= PENALTY.windHigh;
    reasons.push(`strong wind ${state.currentWind.toFixed(0)} kph`);
  } else if (state.currentWind > PENALTY.windGustyThresholdKph) {
    s -= PENALTY.windGusty;
    reasons.push(`gusty ${state.currentWind.toFixed(0)} kph`);
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(s)));
  const band = bandFor(finalScore, state.rainNow);
  const sweet = band === 'good' && isBikeSweetSpot(state);
  const { headline, body } = sweet
    ? bikeSweetSpotVerdict(state)
    : verdict(band, state, reasons);

  return { score: finalScore, band, headline, body, reasons, sweetSpot: sweet };
}

function isBikeSweetSpot(state: EvaluationState): boolean {
  const env = SWEET_SPOT.bike;
  return (
    state.currentTemp >= env.tempMinC &&
    state.currentTemp <= env.tempMaxC &&
    state.currentHumid <= env.humidMaxPct &&
    state.currentWind <= env.windMaxKph &&
    !state.rainNow &&
    !state.wet &&
    !state.paintWet
  );
}

function bikeSweetSpotVerdict(state: EvaluationState): { headline: string; body: string } {
  return {
    headline: 'Magic day.',
    body: `Mild ${state.currentTemp.toFixed(0)}°C, dry roads, breeze under control. These are the days you remember the bike on.`,
  };
}

// ---------------------------------------------------------------------------
// Run-mode scoring
// ---------------------------------------------------------------------------

function scoreRun(
  state: EvaluationState,
  forecast: readonly ForecastHour[],
  apparentTempC: number | undefined,
): ScoreResult {
  let s = 100;
  const reasons: string[] = [];
  const feelsLike = apparentTempC ?? state.currentTemp;

  if (state.rainNow) {
    s -= RUN_PENALTY.rainNow;
    reasons.push('actively raining');
  }

  if (state.puddleLikely) {
    s -= RUN_PENALTY.puddleLikely;
    reasons.push('puddles on low spots');
  }

  if (state.wet && !state.rainNow) {
    const penalty = Math.min(
      RUN_PENALTY.surfaceWetMax,
      RUN_PENALTY.surfaceWetMin + state.residualWaterMm * RUN_PENALTY.surfaceWetPerMm,
    );
    s -= penalty;
    const hr = state.hoursSinceRainEnded;
    reasons.push(`damp${hr != null ? ` (rain ended ${hr}h ago)` : ''}`);
  }

  // Heat ladder — apparent temperature is the primary running hazard.
  if (feelsLike >= RUN_PENALTY.heatDangerThresholdC) {
    s -= RUN_PENALTY.heatDanger;
    reasons.push(`dangerous heat (feels like ${feelsLike.toFixed(0)}°C)`);
  } else if (feelsLike >= RUN_PENALTY.heatExtremeThresholdC) {
    s -= RUN_PENALTY.heatExtreme;
    reasons.push(`extreme heat (feels like ${feelsLike.toFixed(0)}°C)`);
  } else if (feelsLike >= RUN_PENALTY.heatCautionThresholdC) {
    s -= RUN_PENALTY.heatCaution;
    reasons.push(`hot (feels like ${feelsLike.toFixed(0)}°C)`);
  }

  // Warm + humid compounding — sweat can't evaporate.
  if (
    state.currentTemp > RUN_PENALTY.humidWarmTempThresholdC &&
    state.currentHumid > RUN_PENALTY.humidWarmHumidThresholdPct
  ) {
    s -= RUN_PENALTY.humidWarm;
    reasons.push('humid (slows sweat evaporation)');
  }

  if (
    state.currentTemp < RUN_PENALTY.coldWetTempThresholdC &&
    (state.wet || state.paintWet)
  ) {
    s -= RUN_PENALTY.coldWet;
    reasons.push('cold + wet');
  }
  if (state.currentTemp <= RUN_PENALTY.freezingTempThresholdC) {
    s -= RUN_PENALTY.freezing;
    reasons.push('freezing — icy patches');
  }
  if (state.currentTemp <= RUN_PENALTY.coldExtremeThresholdC) {
    s -= RUN_PENALTY.coldExtreme;
    reasons.push('extreme cold (frostbite risk)');
  }

  const next3hRain = forecast
    .slice(0, RUN_PENALTY.rainIncomingLookaheadHours)
    .reduce((sum, f) => sum + (f.rain_mm || 0), 0);
  if (next3hRain >= RUN_PENALTY.rainIncomingTriggerMm && !state.rainNow) {
    const penalty = Math.min(
      RUN_PENALTY.rainIncomingMax,
      RUN_PENALTY.rainIncomingMin + next3hRain * RUN_PENALTY.rainIncomingPerMm,
    );
    s -= penalty;
    reasons.push(`rain incoming (${next3hRain.toFixed(1)}mm in next 3h)`);
  }

  if (state.currentWind > RUN_PENALTY.windHighThresholdKph) {
    s -= RUN_PENALTY.windHigh;
    reasons.push(`strong wind ${state.currentWind.toFixed(0)} kph`);
  } else if (state.currentWind > RUN_PENALTY.windGustyThresholdKph) {
    s -= RUN_PENALTY.windGusty;
    reasons.push(`gusty ${state.currentWind.toFixed(0)} kph`);
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(s)));
  const band = bandFor(finalScore, state.rainNow);
  const sweet = band === 'good' && isRunSweetSpot(state);
  const { headline, body } = sweet
    ? runSweetSpotVerdict(state)
    : verdictRun(band, state, reasons, feelsLike);

  return { score: finalScore, band, headline, body, reasons, sweetSpot: sweet };
}

function isRunSweetSpot(state: EvaluationState): boolean {
  const env = SWEET_SPOT.run;
  return (
    state.currentTemp >= env.tempMinC &&
    state.currentTemp <= env.tempMaxC &&
    state.currentHumid <= env.humidMaxPct &&
    state.currentWind <= env.windMaxKph &&
    state.currentClouds >= env.cloudMinPct &&
    state.currentClouds <= env.cloudMaxPct &&
    !state.rainNow &&
    !state.wet
  );
}

function runSweetSpotVerdict(state: EvaluationState): { headline: string; body: string } {
  return {
    headline: 'Magic conditions.',
    body: `Cool ${state.currentTemp.toFixed(0)}°C, dry air, light wind, partial sun. The conditions distance runners pray for — these are the days you remember.`,
  };
}

function verdictRun(
  band: Band,
  state: EvaluationState,
  reasons: readonly string[],
  feelsLike: number,
): { headline: string; body: string } {
  if (state.rainNow) {
    return {
      headline: 'It is raining.',
      body: 'Active rain. Doable in the right gear, but visibility is down and sidewalks get slick. Plan for soaked shoes.',
    };
  }
  if (feelsLike >= RUN_PENALTY.heatDangerThresholdC) {
    return {
      headline: 'Dangerous heat.',
      body: `Feels like ${feelsLike.toFixed(0)}°C. Heat-stroke territory — defer until early morning or after sunset, or take it indoors.`,
    };
  }
  if (band === 'good') {
    return {
      headline: 'Lace up.',
      body: 'Conditions are dialed. Roads in shape, weather cooperative. Easy day to put miles down.',
    };
  }
  if (band === 'fair') {
    return {
      headline: 'Doable.',
      body: `${capitalize(reasons.join(', '))}. Adjust pace and gear; not a PR day but a perfectly fine training run.`,
    };
  }
  if (band === 'poor') {
    return {
      headline: 'Not ideal.',
      body: `${capitalize(reasons.join(', '))}. Treadmill or shorter loop close to home is the smart move.`,
    };
  }
  return {
    headline: 'Skip outdoor.',
    body: `${capitalize(reasons.join(', '))}. Conditions stacked against you — indoor session today.`,
  };
}

function bandFor(value: number, rainNow: boolean): Band {
  if (rainNow) return 'bad';
  if (value >= BAND_THRESHOLD.good) return 'good';
  if (value >= BAND_THRESHOLD.fair) return 'fair';
  if (value >= BAND_THRESHOLD.poor) return 'poor';
  return 'bad';
}

function verdict(
  band: Band,
  state: EvaluationState,
  reasons: readonly string[],
): { headline: string; body: string } {
  if (state.rainNow) {
    return {
      headline: 'It is raining.',
      body: 'Active precipitation. Skip the bike unless you really have to. Visibility down, brakes degraded, painted lanes treacherous.',
    };
  }
  if (band === 'good') {
    const tail =
      state.hoursSinceRainEnded == null
        ? 'No recent rain to worry about.'
        : `Last rain ${state.hoursSinceRainEnded}h ago, fully dried out.`;
    return { headline: 'Send it.', body: `Dry roads, decent conditions. ${tail}` };
  }
  if (band === 'fair') {
    return {
      headline: 'Probably fine.',
      body: `${capitalize(reasons.join(', '))}. Ride with awareness — watch painted lanes and metal grates if anything is damp.`,
    };
  }
  if (band === 'poor') {
    return {
      headline: 'Not great.',
      body: `${capitalize(reasons.join(', '))}. Consider transit or wait it out if you can.`,
    };
  }
  return {
    headline: 'Skip it.',
    body: `${capitalize(reasons.join(', '))}. Conditions stacked against you.`,
  };
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

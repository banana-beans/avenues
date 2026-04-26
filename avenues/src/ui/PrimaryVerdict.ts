import type { EvaluationState } from '@/model/drying.ts';
import type { ScoreResult } from '@/model/score.ts';
import type { Location, Mode } from '@/storage/types.ts';

import { escapeHtml } from './format.ts';

export interface PrimaryVerdictExtras {
  readonly mode: Mode;
  /** Feels-like temperature in °C (run mode telemetry). */
  readonly apparentTempC?: number;
}

export function renderPrimary(
  loc: Location,
  state: EvaluationState,
  scored: ScoreResult,
  extras: PrimaryVerdictExtras,
): string {
  const headlineNoTrailingPeriod = scored.headline.replace(/\.$/, '');
  const surfaceLabel = state.rainNow
    ? 'WET·RAIN'
    : state.wet
      ? 'DAMP'
      : state.paintWet
        ? 'PAINT WET'
        : 'DRY';
  const sinceRain =
    state.hoursSinceRainEnded == null ? '—' : `${state.hoursSinceRainEnded}H`;
  const scoreLabel = extras.mode === 'run' ? 'RUNNABILITY' : 'RIDEABILITY';

  // Mode-specific telemetry: replace CLOUD with FEELS LIKE in run mode.
  const climateCell =
    extras.mode === 'run'
      ? `
        <div class="tel-cell">
          <div class="tel-label">FEELS LIKE</div>
          <div class="tel-value">${(extras.apparentTempC ?? state.currentTemp).toFixed(1)}<span class="unit">°C</span></div>
        </div>
      `
      : `
        <div class="tel-cell">
          <div class="tel-label">CLOUD</div>
          <div class="tel-value">${state.currentClouds.toFixed(0)}<span class="unit">%</span></div>
        </div>
      `;

  return `
    <div class="primary">
      <div class="score-block">
        <div class="score-label">${scoreLabel} · ${escapeHtml(loc.name)}</div>
        <div class="score ${scored.band}">${scored.score}</div>
        <div class="score-suffix">/ 100</div>
      </div>
      <div class="verdict-block">
        <div class="verdict-headline">${escapeHtml(headlineNoTrailingPeriod)}<span class="accent">.</span></div>
        <div class="verdict-body">${escapeHtml(scored.body)}</div>
      </div>
      <div class="telemetry">
        <div class="tel-cell">
          <div class="tel-label">TEMP</div>
          <div class="tel-value">${state.currentTemp.toFixed(1)}<span class="unit">°C</span></div>
        </div>
        <div class="tel-cell">
          <div class="tel-label">WIND</div>
          <div class="tel-value">${state.currentWind.toFixed(0)}<span class="unit">KPH</span></div>
        </div>
        <div class="tel-cell">
          <div class="tel-label">HUMID</div>
          <div class="tel-value">${state.currentHumid.toFixed(0)}<span class="unit">%</span></div>
        </div>
        ${climateCell}
        <div class="tel-cell">
          <div class="tel-label">SURFACE</div>
          <div class="tel-value">${surfaceLabel}</div>
        </div>
        <div class="tel-cell">
          <div class="tel-label">SINCE RAIN</div>
          <div class="tel-value">${sinceRain}</div>
        </div>
      </div>
    </div>
  `;
}

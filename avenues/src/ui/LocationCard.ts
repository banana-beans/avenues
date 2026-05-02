import type { EvaluationState } from '@/model/drying.ts';
import type { ScoreResult } from '@/model/score.ts';
import type { Location, Mode } from '@/storage/types.ts';

import { escapeHtml } from './format.ts';

export interface LocationCardData {
  readonly location: Location;
  readonly state: EvaluationState | null;
  readonly score: ScoreResult | null;
  /** Feels-like temperature in °C — surfaced in RUN mode. */
  readonly apparentTempC?: number;
  readonly error?: string;
}

export interface LocationsExtras {
  readonly mode: Mode;
}

export function renderLocations(
  cards: readonly LocationCardData[],
  extras: LocationsExtras = { mode: 'bike' },
): string {
  const items = cards.map((c) => renderCard(c, extras.mode)).join('');
  return `
    <div class="section-head">
      <div class="section-title">LOCATIONS</div>
      <div class="section-sub">click EDIT on hover · ★ sets primary</div>
    </div>
    <div class="locations">
      ${items}
      <button class="add-loc" data-action="add-location">+ ADD LOCATION</button>
    </div>
  `;
}

function renderCard(card: LocationCardData, mode: Mode): string {
  const { location, state, score } = card;
  const isPrimary = location.role === 'primary';

  if (!state || !score) {
    return `
      <div class="loc-card" data-loc="${escapeHtml(location.id)}">
        <div class="strip"></div>
        <div class="loc-head"><div class="loc-name">${escapeHtml(location.name)}</div></div>
        <div class="loc-line">${card.error ? escapeHtml(card.error) : 'no data'}</div>
      </div>
    `;
  }

  // Surface label: paint-wet matters to cyclists (slick lanes); irrelevant to
  // runners, who'd just call any residual moisture "damp".
  const surfaceText = state.rainNow
    ? 'wet (raining)'
    : state.wet
      ? 'damp'
      : mode === 'bike' && state.paintWet
        ? 'paint wet'
        : 'dry';

  // Run mode swaps WIND telemetry for FEELS LIKE — the dominant runnability
  // input is heat/feels-like, not aero load.
  const secondaryStat =
    mode === 'run'
      ? `<span class="lbl" style="margin-left:10px">FEELS</span>${(card.apparentTempC ?? state.currentTemp).toFixed(0)}°C`
      : `<span class="lbl" style="margin-left:10px">WIND</span>${state.currentWind.toFixed(0)} kph`;

  const headlineFirstClause = score.body.split('.')[0] ?? '';

  return `
    <div class="loc-card ${score.band} ${isPrimary ? 'primary-loc' : ''}" data-loc="${escapeHtml(location.id)}">
      <div class="strip"></div>
      <div class="loc-head">
        <div class="loc-name">${escapeHtml(location.name)}${isPrimary ? ' ★' : ''}</div>
        <div class="loc-score ${score.band}">${score.score}</div>
      </div>
      <div class="loc-line">
        <span class="lbl">TEMP</span>${state.currentTemp.toFixed(1)}°C
        ${secondaryStat}
      </div>
      <div class="loc-line">
        <span class="lbl">SURF</span>${surfaceText}${state.puddleLikely ? ' · puddles' : ''}
      </div>
      <div class="loc-verdict">${escapeHtml(score.headline)} ${escapeHtml(headlineFirstClause)}.</div>
      <div class="loc-actions">
        <button data-action="edit-location" data-id="${escapeHtml(location.id)}">EDIT</button>
        <button data-action="make-primary" data-id="${escapeHtml(location.id)}">★ PRIMARY</button>
      </div>
    </div>
  `;
}

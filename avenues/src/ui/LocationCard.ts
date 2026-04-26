import type { EvaluationState } from '@/model/drying.ts';
import type { ScoreResult } from '@/model/score.ts';
import type { Location } from '@/storage/types.ts';

import { escapeHtml } from './format.ts';

export interface LocationCardData {
  readonly location: Location;
  readonly state: EvaluationState | null;
  readonly score: ScoreResult | null;
  readonly error?: string;
}

export function renderLocations(cards: readonly LocationCardData[]): string {
  const items = cards.map(renderCard).join('');
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

function renderCard(card: LocationCardData): string {
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

  const surfaceText = state.rainNow
    ? 'wet (raining)'
    : state.wet
      ? 'damp'
      : state.paintWet
        ? 'paint wet'
        : 'dry';
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
        <span class="lbl" style="margin-left:10px">WIND</span>${state.currentWind.toFixed(0)} kph
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

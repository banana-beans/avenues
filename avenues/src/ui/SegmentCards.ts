import type { LocationCardData } from './LocationCard.ts';
import type { Leg } from '@/storage/segments.ts';
import type { Mode } from '@/storage/types.ts';

import { escapeHtml } from './format.ts';

/**
 * Render the legs that apply to the current mode. A leg with `mode: 'both'`
 * always shows; mode-specific legs only show in their own mode. Returns an
 * empty string when no legs have both endpoints scored — keeps the UI tidy on
 * first load before weather resolves.
 */
export function renderLegs(
  mode: Mode,
  legs: readonly Leg[],
  cards: readonly LocationCardData[],
): string {
  const applicable = legs.filter((l) => l.mode === mode || l.mode === 'both');
  const items = applicable
    .map((leg) => renderLeg(leg, cards))
    .filter((html) => html.length > 0)
    .join('');
  if (!items) return '';

  const title = mode === 'run' ? 'RUN ROUTES' : 'BIKE LEGS';
  const sub = mode === 'run' ? 'your routes · weakest endpoint wins' : 'your actual rides · weakest endpoint wins';

  return `
    <div class="section-head">
      <div class="section-title">${title}</div>
      <div class="section-sub">${sub}</div>
    </div>
    <div class="legs">${items}</div>
  `;
}

function renderLeg(leg: Leg, cards: readonly LocationCardData[]): string {
  const a = cards.find((c) => c.location.id === leg.fromId);
  const b = cards.find((c) => c.location.id === leg.toId);
  if (!a?.score || !b?.score) return '';

  const worst = a.score.score <= b.score.score ? a : b;
  const score = worst.score;
  if (!score) return '';
  const bottleneckHeadline = score.headline.replace(/\.$/, '').toLowerCase();

  return `
    <div class="leg-card ${score.band}">
      <div class="strip"></div>
      <div class="leg-head">
        <div class="leg-label">${escapeHtml(leg.label)}</div>
        <div class="leg-score ${score.band}">${score.score}</div>
      </div>
      <div class="leg-detail">weakest: ${escapeHtml(worst.location.name)} · ${escapeHtml(bottleneckHeadline)}</div>
    </div>
  `;
}

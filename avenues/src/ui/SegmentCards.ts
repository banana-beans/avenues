import type { LocationCardData } from './LocationCard.ts';
import type { BikeLeg } from '@/storage/segments.ts';

import { escapeHtml } from './format.ts';

export function renderBikeLegs(
  legs: readonly BikeLeg[],
  cards: readonly LocationCardData[],
): string {
  const items = legs
    .map((leg) => renderLeg(leg, cards))
    .filter((html) => html.length > 0)
    .join('');
  if (!items) return '';
  return `
    <div class="section-head">
      <div class="section-title">BIKE LEGS</div>
      <div class="section-sub">your actual rides · weakest endpoint wins</div>
    </div>
    <div class="legs">${items}</div>
  `;
}

function renderLeg(leg: BikeLeg, cards: readonly LocationCardData[]): string {
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

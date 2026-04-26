import { score as scoreFn } from '@/model/score.ts';
import { nextCommuteWindows, projectForward } from '@/model/project.ts';
import type { WeatherHour } from '@/data/openmeteo.ts';
import type { Location } from '@/storage/types.ts';

import { escapeHtml, fmtTime } from './format.ts';

export function renderCommuteWindows(
  primary: Location,
  history: readonly WeatherHour[],
  forecast: readonly WeatherHour[],
  now: Date = new Date(),
): string {
  const windows = nextCommuteWindows(now);
  if (windows.length === 0) return '';

  const cards = windows
    .map((w) => {
      const projected = projectForward(history, forecast, w.hoursAhead, 1);
      if (!projected) return '';
      const slice = forecast.slice(w.hoursAhead, w.hoursAhead + 3);
      const sc = scoreFn(projected, slice);
      return `
        <div class="commute-card">
          <div class="commute-time">${escapeHtml(w.label)}</div>
          <div class="commute-window">~${fmtTime(w.time)}</div>
          <div class="commute-verdict">
            <span class="commute-score ${sc.band}">${sc.score}</span>
            <strong>${escapeHtml(sc.headline)}</strong>
            ${escapeHtml(sc.body)}
          </div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="section-head">
      <div class="section-title">COMMUTE WINDOWS</div>
      <div class="section-sub">primary: ${escapeHtml(primary.name)}</div>
    </div>
    <div class="commute">${cards}</div>
  `;
}

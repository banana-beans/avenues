import { score as scoreFn } from '@/model/score.ts';
import { nextCommuteWindows, projectForward } from '@/model/project.ts';
import type { WeatherHour } from '@/data/openmeteo.ts';
import type { Location, Mode } from '@/storage/types.ts';

import { escapeHtml, fmtTime } from './format.ts';

export interface CommuteWindowsExtras {
  readonly mode: Mode;
}

export function renderCommuteWindows(
  primary: Location,
  history: readonly WeatherHour[],
  forecast: readonly WeatherHour[],
  extras: CommuteWindowsExtras,
  now: Date = new Date(),
): string {
  const windows = nextCommuteWindows(now);
  if (windows.length === 0) return '';

  const sectionTitle = extras.mode === 'run' ? 'RUN WINDOWS' : 'COMMUTE WINDOWS';

  const cards = windows
    .map((w) => {
      const projected = projectForward(history, forecast, w.hoursAhead, 1);
      if (!projected) return '';
      const slice = forecast.slice(w.hoursAhead, w.hoursAhead + 3);
      // Use the apparent-temp at the projection horizon when available; this is
      // what the user will actually feel when they step outside in N hours.
      const horizon = forecast[w.hoursAhead];
      const apparentTempC = horizon?.apparentTemp;
      const sc = scoreFn(projected, slice, {
        mode: extras.mode,
        ...(apparentTempC != null ? { apparentTempC } : {}),
      });
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
      <div class="section-title">${sectionTitle}</div>
      <div class="section-sub">primary: ${escapeHtml(primary.name)}</div>
    </div>
    <div class="commute">${cards}</div>
  `;
}

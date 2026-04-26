import type { WeatherHour } from '@/data/openmeteo.ts';
import type { Location } from '@/storage/types.ts';

import { escapeHtml, fmtTime } from './format.ts';

const FORECAST_HOURS = 18;

export function renderForecastStrip(
  primary: Location,
  history: readonly WeatherHour[],
  forecast: readonly WeatherHour[],
): string {
  const lastHistory = history[history.length - 1];
  if (!lastHistory) return '';

  const visible: WeatherHour[] = [lastHistory, ...forecast.slice(0, FORECAST_HOURS - 1)];
  const maxRain = visible.reduce((m, h) => Math.max(m, h.rain_mm || 0), 2);

  const cells = visible
    .map((h, idx) => {
      const ratio = Math.min(1, (h.rain_mm || 0) / maxRain);
      const heightPct = Math.max(2, ratio * 100);
      const isNow = idx === 0;
      return `
        <div class="fhour ${isNow ? 'now' : ''}">
          <div class="fhour-time">${fmtTime(h.time)}</div>
          <div class="fhour-bar">
            <div class="fhour-bar-fill" style="height:${heightPct}%; opacity:${ratio > 0.02 ? 1 : 0}"></div>
          </div>
          <div class="fhour-temp">${h.temp.toFixed(0)}°</div>
          <div class="fhour-precip">${h.rain_mm ? `${h.rain_mm.toFixed(1)}mm` : '—'}</div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="forecast-wrap">
      <div class="section-head">
        <div class="section-title">${FORECAST_HOURS}-HOUR FORECAST</div>
        <div class="section-sub">${escapeHtml(primary.name)} · bars = rainfall, max ${maxRain.toFixed(1)}mm</div>
      </div>
      <div class="forecast">${cells}</div>
    </div>
  `;
}

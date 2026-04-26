import type { Location, RideLogEntry } from '@/storage/types.ts';

import { bandFromScore, escapeHtml, fmtLogStamp } from './format.ts';

export function renderRideLog(
  log: readonly RideLogEntry[],
  locations: readonly Location[],
): string {
  const opts = locations
    .map((l) => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`)
    .join('');

  const rows =
    log.length === 0
      ? '<div class="log-empty">No rides logged yet. Log a ride to track conditions over time.</div>'
      : log
          .map((entry, i) => {
            const stamp = fmtLogStamp(new Date(entry.ts));
            const band = entry.band ?? bandFromScore(entry.score);
            const what = entry.note?.trim() || entry.locName || 'ride';
            return `
              <div class="log-row">
                <div class="when">${escapeHtml(stamp)}</div>
                <div class="what">${escapeHtml(what)}</div>
                <div class="score-mini ${band}">${entry.score}</div>
                <div><button data-action="remove-log" data-index="${i}" aria-label="Remove">×</button></div>
              </div>
            `;
          })
          .join('');

  return `
    <div class="log-wrap">
      <div class="section-head">
        <div class="section-title">RIDE LOG</div>
        <div class="section-sub">log a ride to capture conditions snapshot</div>
      </div>
      <div class="log-list">${rows}</div>
      <div class="log-add">
        <select id="logLoc">${opts}</select>
        <input id="logNote" placeholder="optional note (route, etc)" />
        <button class="btn primary" data-action="log-ride">LOG RIDE NOW</button>
      </div>
    </div>
  `;
}

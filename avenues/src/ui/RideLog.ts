import type { Location, Mode, RideLogEntry } from '@/storage/types.ts';

import { bandFromScore, escapeHtml, fmtLogStamp } from './format.ts';

export interface RideLogExtras {
  /** Current activity mode — drives copy + the default mode-tag for new entries. */
  readonly mode: Mode;
}

export function renderRideLog(
  log: readonly RideLogEntry[],
  locations: readonly Location[],
  extras: RideLogExtras,
): string {
  const opts = locations
    .map((l) => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`)
    .join('');

  const title = extras.mode === 'run' ? 'RUN LOG' : 'RIDE LOG';
  const sub = extras.mode === 'run' ? 'log a run to capture conditions snapshot' : 'log a ride to capture conditions snapshot';
  const cta = extras.mode === 'run' ? 'LOG RUN NOW' : 'LOG RIDE NOW';

  const rows =
    log.length === 0
      ? `<div class="log-empty">No entries yet. Tap ${cta} to capture conditions over time.</div>`
      : log
          .map((entry, i) => {
            const stamp = fmtLogStamp(new Date(entry.ts));
            const band = entry.band ?? bandFromScore(entry.score);
            const what = entry.note?.trim() || entry.locName || 'entry';
            // Older entries lack `mode` — default tag to 'bike' (matches Mode default).
            const mode: Mode = entry.mode ?? 'bike';
            return `
              <div class="log-row">
                <div class="when">${escapeHtml(stamp)}</div>
                <div class="what">
                  <span class="log-mode log-mode-${mode}">${mode === 'run' ? 'RUN' : 'BIKE'}</span>
                  ${escapeHtml(what)}
                </div>
                <div class="score-mini ${band}">${entry.score}</div>
                <div><button data-action="remove-log" data-index="${i}" aria-label="Remove">×</button></div>
              </div>
            `;
          })
          .join('');

  return `
    <div class="log-wrap">
      <div class="section-head">
        <div class="section-title">${title}</div>
        <div class="section-sub">${sub}</div>
      </div>
      <div class="log-list">${rows}</div>
      <div class="log-add">
        <select id="logLoc">${opts}</select>
        <input id="logNote" placeholder="optional note (route, etc)" />
        <button class="btn primary" data-action="log-ride">${cta}</button>
      </div>
    </div>
  `;
}

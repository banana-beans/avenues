/**
 * Display + speech formatters for run telemetry. Pure strings in/out.
 */

import { METRES_PER_MILE, type Split } from './tracker.ts';

/** Format milliseconds as `M:SS` (mm:ss), no leading zero on minutes. */
export function fmtClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format a distance in metres as `1.23 mi`. */
export function fmtMiles(metres: number): string {
  return `${(metres / METRES_PER_MILE).toFixed(2)} mi`;
}

/**
 * Format pace from total distance + total time as `M:SS /mi`.
 * Returns `--:-- /mi` when distance is too short to be meaningful (< 50m).
 */
export function fmtPace(metres: number, ms: number): string {
  if (metres < 50 || ms <= 0) return '--:-- /mi';
  const seconds = ms / 1000;
  const miles = metres / METRES_PER_MILE;
  const secPerMile = seconds / miles;
  const m = Math.floor(secPerMile / 60);
  const s = Math.round(secPerMile - m * 60);
  // Roll over 60s to the next minute.
  if (s === 60) return `${m + 1}:00 /mi`;
  return `${m}:${s.toString().padStart(2, '0')} /mi`;
}

/**
 * Spoken text for a completed mile split. Format chosen to be brief but
 * complete: mile number, just-completed split, cumulative time. The phone
 * speaker will say this; punctuation is what triggers natural pauses in
 * SpeechSynthesis voices.
 */
export function speechForSplit(split: Split): string {
  return `Mile ${split.mile}. Split ${spokenDuration(split.splitMs)}. Total ${spokenDuration(split.totalMs)}.`;
}

/**
 * "8 minutes 12 seconds" / "1 minute 5 seconds" / "45 seconds".
 * Web Speech voices read this far more naturally than "8:12".
 */
export function spokenDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  if (m === 0) return `${s} ${pluralize(s, 'second', 'seconds')}`;
  if (s === 0) return `${m} ${pluralize(m, 'minute', 'minutes')}`;
  return `${m} ${pluralize(m, 'minute', 'minutes')} ${s} ${pluralize(s, 'second', 'seconds')}`;
}

function pluralize(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}

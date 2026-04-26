/**
 * Forward projection of the drying model into upcoming commute windows.
 *
 * Given history + forecast hourly arrays, we splice the relevant slice of the
 * forecast onto the history and re-run {@link evaluate}. The "what does the
 * road look like at 8:30am tomorrow?" question reduces to: walk the same
 * water-balance loop, but with future hours appended.
 */

import { evaluate, type EvaluationState, type HourRecord } from './drying.ts';

export interface CommuteWindow {
  /** Display label, e.g. "TODAY · MORNING". */
  readonly label: string;
  /** Wall-clock time the window starts (local). */
  readonly time: Date;
  /** Hours from "now" to the start of the window. */
  readonly hoursAhead: number;
}

/**
 * Replay the drying model with `hoursAhead` of forecast appended.
 * Useful for "how wet will the road look in N hours?"
 *
 * Returns null if the inputs can't produce any state (empty history).
 */
export function projectForward(
  history: readonly HourRecord[],
  forecast: readonly HourRecord[],
  hoursAhead: number,
  durationHours = 1,
): EvaluationState | null {
  if (history.length === 0) return null;

  const horizon = hoursAhead + durationHours;
  const tail = forecast.slice(0, Math.min(horizon, forecast.length));
  return evaluate([...history, ...tail]);
}

/**
 * Generate the next 1–2 commute windows starting from `now`.
 * Heuristic: morning ride 8:30, evening ride 18:30. Skip windows in the past
 * (or starting in <30 min, which is too soon to be useful).
 */
export function nextCommuteWindows(now: Date = new Date()): CommuteWindow[] {
  const todayMorning = atHour(now, 8, 30);
  const todayEvening = atHour(now, 18, 30);
  const tomorrowMorning = atHour(addDays(now, 1), 8, 30);

  const buffer = 30 * 60 * 1000; // 30 minutes
  const candidates: { date: Date; label: (sameDay: boolean) => string }[] = [
    { date: todayMorning, label: () => 'TODAY · MORNING' },
    { date: todayEvening, label: () => 'TODAY · EVENING' },
    { date: tomorrowMorning, label: () => 'TOMORROW · MORNING' },
  ];

  const out: CommuteWindow[] = [];
  for (const c of candidates) {
    if (c.date.getTime() <= now.getTime() + buffer) continue;
    const sameDay = c.date.toDateString() === now.toDateString();
    out.push({
      label: c.label(sameDay),
      time: c.date,
      hoursAhead: Math.max(0, Math.round((c.date.getTime() - now.getTime()) / 3.6e6)),
    });
    if (out.length >= 2) break;
  }
  return out;
}

function atHour(d: Date, hour: number, minute: number): Date {
  const out = new Date(d);
  out.setHours(hour, minute, 0, 0);
  return out;
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

import { describe, expect, it } from 'vitest';

import type { HourRecord } from './drying.ts';
import { nextCommuteWindows, projectForward } from './project.ts';

function mkHour(ms: number, opts: Partial<HourRecord> = {}): HourRecord {
  return {
    time: new Date(ms),
    rain_mm: 0,
    temp: 18,
    humid: 50,
    clouds: 30,
    wind: 10,
    isDay: true,
    ...opts,
  };
}

describe('projectForward', () => {
  it('returns null on empty history', () => {
    expect(projectForward([], [], 0)).toBeNull();
  });

  it('extrapolates forecast onto history before evaluating', () => {
    const t0 = new Date('2026-04-26T12:00:00').getTime();
    const history = Array.from({ length: 24 }, (_, i) => mkHour(t0 + i * 3.6e6));
    const forecast: HourRecord[] = [
      mkHour(t0 + 24 * 3.6e6),                  // +1h: dry
      mkHour(t0 + 25 * 3.6e6, { rain_mm: 5 }),  // +2h: heavy rain
      mkHour(t0 + 26 * 3.6e6),                  // +3h: dry
    ];

    // Baseline: zero forecast hours stitched on → state right now, dry history.
    const baseline = projectForward(history, forecast, 0, 0)!;
    expect(baseline.wet).toBe(false);

    // Project to +2h: rain hour now inside the window → wet & rainNow.
    const projected = projectForward(history, forecast, 1, 1)!;
    expect(projected.wet).toBe(true);
    expect(projected.rainNow).toBe(true);
  });

  it('truncates forecast to hoursAhead + duration', () => {
    const t0 = Date.now();
    const history = [mkHour(t0)];
    const forecast = Array.from({ length: 100 }, (_, i) =>
      mkHour(t0 + (i + 1) * 3.6e6, { rain_mm: i === 50 ? 5 : 0 }),
    );
    const projected = projectForward(history, forecast, 5, 1)!;
    // Only 6 hours worth of forecast should be stitched in; rain at hour 50 not visible.
    expect(projected.rainNow).toBe(false);
    expect(projected.wet).toBe(false);
  });
});

describe('nextCommuteWindows', () => {
  it('skips past windows and returns up to 2 future ones', () => {
    const now = new Date('2026-04-26T10:00:00'); // mid-morning, after 8:30
    const windows = nextCommuteWindows(now);

    expect(windows.length).toBe(2);
    expect(windows[0]?.label).toBe('TODAY · EVENING');
    expect(windows[1]?.label).toBe('TOMORROW · MORNING');
  });

  it('includes today morning when called early', () => {
    const now = new Date('2026-04-26T05:00:00');
    const windows = nextCommuteWindows(now);
    expect(windows[0]?.label).toBe('TODAY · MORNING');
  });

  it('skips today evening when called after 18:30', () => {
    const now = new Date('2026-04-26T19:00:00');
    const windows = nextCommuteWindows(now);
    expect(windows[0]?.label).toBe('TOMORROW · MORNING');
    expect(windows.length).toBe(1);
  });

  it('hoursAhead is rounded to whole hours from now', () => {
    const now = new Date('2026-04-26T05:00:00');
    const windows = nextCommuteWindows(now);
    // 5:00 → 8:30 = 3.5h → rounds to 4
    expect(windows[0]?.hoursAhead).toBe(4);
  });
});

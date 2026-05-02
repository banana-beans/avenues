import { describe, expect, it } from 'vitest';

import {
  fmtClock,
  fmtMiles,
  fmtPace,
  speechForSplit,
  spokenDuration,
} from './format.ts';
import { METRES_PER_MILE } from './tracker.ts';

describe('fmtClock', () => {
  it('formats sub-minute', () => {
    expect(fmtClock(45_000)).toBe('0:45');
  });
  it('formats minutes + seconds with leading zero on seconds', () => {
    expect(fmtClock(8 * 60_000 + 7_000)).toBe('8:07');
  });
  it('rounds to nearest second', () => {
    expect(fmtClock(8 * 60_000 + 7_400)).toBe('8:07');
    expect(fmtClock(8 * 60_000 + 7_700)).toBe('8:08');
  });
  it('clamps negative input to 0', () => {
    expect(fmtClock(-100)).toBe('0:00');
  });
});

describe('fmtMiles', () => {
  it('formats with two decimals', () => {
    expect(fmtMiles(METRES_PER_MILE)).toBe('1.00 mi');
    expect(fmtMiles(METRES_PER_MILE * 3.5)).toBe('3.50 mi');
  });
});

describe('fmtPace', () => {
  it('returns dashes when distance is too short', () => {
    expect(fmtPace(10, 60_000)).toBe('--:-- /mi');
  });
  it('computes minutes-per-mile from distance + time', () => {
    // 1 mile in 480s = 8:00 /mi
    expect(fmtPace(METRES_PER_MILE, 480_000)).toBe('8:00 /mi');
  });
  it('rolls 60 seconds to the next minute', () => {
    // Construct a case where rounding gives s===60.
    // 8m 59.6s/mi for 1 mile → rounds to 8:60 → should display 9:00
    expect(fmtPace(METRES_PER_MILE, (8 * 60 + 59.6) * 1000)).toBe('9:00 /mi');
  });
});

describe('spokenDuration', () => {
  it('renders seconds-only when under a minute', () => {
    expect(spokenDuration(45_000)).toBe('45 seconds');
  });
  it('renders minutes-only when seconds are zero', () => {
    expect(spokenDuration(8 * 60_000)).toBe('8 minutes');
  });
  it('renders mixed minutes + seconds', () => {
    expect(spokenDuration(8 * 60_000 + 12_000)).toBe('8 minutes 12 seconds');
  });
  it('uses singular forms for 1', () => {
    expect(spokenDuration(60_000 + 1_000)).toBe('1 minute 1 second');
  });
});

describe('speechForSplit', () => {
  it('produces a complete spoken sentence for a normal mile', () => {
    const text = speechForSplit({ mile: 2, splitMs: 8 * 60_000 + 12_000, totalMs: 16 * 60_000 + 54_000 });
    expect(text).toBe('Mile 2. Split 8 minutes 12 seconds. Total 16 minutes 54 seconds.');
  });
});

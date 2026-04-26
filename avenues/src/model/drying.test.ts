import { describe, expect, it } from 'vitest';

import {
  cloudFactor,
  dryingRate,
  evaluate,
  humidityFactor,
  tempFactor,
  windFactor,
  type HourRecord,
} from './drying.ts';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

interface HourOpts {
  rain_mm?: number;
  temp?: number;
  humid?: number;
  clouds?: number;
  wind?: number;
  isDay?: boolean;
  hourOffset?: number; // hours before "now" (24 = 24h ago, 0 = now)
}

const NOW = new Date('2026-04-26T12:00:00Z');

function mkHour(opts: HourOpts = {}): HourRecord {
  const offset = opts.hourOffset ?? 0;
  return {
    time: new Date(NOW.getTime() - offset * 3_600_000),
    rain_mm: opts.rain_mm ?? 0,
    temp: opts.temp ?? 18,
    humid: opts.humid ?? 50,
    clouds: opts.clouds ?? 30,
    wind: opts.wind ?? 10,
    isDay: opts.isDay ?? true,
  };
}

/** Build a 24-hour history with the given per-hour overrides. Index 0 = 23h ago, index 23 = now. */
function mkHistory(
  base: HourOpts,
  overrides: Record<number, HourOpts> = {},
): HourRecord[] {
  const out: HourRecord[] = [];
  for (let i = 0; i < 24; i++) {
    const hourOffset = 23 - i;
    const override = overrides[i] ?? {};
    out.push(mkHour({ ...base, ...override, hourOffset }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Factor functions: anchor the model shape
// ---------------------------------------------------------------------------

describe('drying-rate factor functions', () => {
  it('tempFactor: freezing, cold, linear above 5°C, capped', () => {
    expect(tempFactor(-5)).toBe(0.05);
    expect(tempFactor(0)).toBe(0.05);
    expect(tempFactor(2)).toBe(0.3);
    expect(tempFactor(5)).toBeCloseTo(0.3, 5);
    expect(tempFactor(20)).toBeCloseTo(0.3 + 15 / 18, 5);
    expect(tempFactor(50)).toBe(2.5); // cap
  });

  it('windFactor: square-root scaling, capped at 2.5', () => {
    expect(windFactor(0)).toBe(0.5);
    expect(windFactor(10)).toBeCloseTo(0.5 + Math.sqrt(10) / 3.5, 5);
    expect(windFactor(1000)).toBe(2.5); // cap
  });

  it('humidityFactor: 50% RH ≈ 1.4, clamped to [0.4, 2.5]', () => {
    expect(humidityFactor(50)).toBeCloseTo(1.4, 5);
    expect(humidityFactor(0)).toBe(0.4); // clamped low
    expect(humidityFactor(100)).toBe(2.5); // clamped high (raw would be ~3.04)
    // Mid-range value below the cap to anchor the curve shape:
    expect(humidityFactor(80)).toBeCloseTo(0.4 + 1.6 ** 1.4, 5);
  });

  it('cloudFactor: linear from 1.0 (clear) to 2.0 (overcast)', () => {
    expect(cloudFactor(0)).toBe(1.0);
    expect(cloudFactor(50)).toBe(1.5);
    expect(cloudFactor(100)).toBe(2.0);
  });

  it('dryingRate: night drying is ~55% of day drying', () => {
    const day = dryingRate(20, 10, 50, 0, true);
    const night = dryingRate(20, 10, 50, 0, false);
    expect(night / day).toBeCloseTo(0.55, 5);
  });
});

// ---------------------------------------------------------------------------
// Six smoke-test scenarios
// ---------------------------------------------------------------------------

describe('evaluate — smoke scenarios', () => {
  it('1. dry baseline: 24h no rain, mild conditions → fully dry', () => {
    const hist = mkHistory({ temp: 18, humid: 50, wind: 10, clouds: 30 });
    const s = evaluate(hist);

    expect(s).not.toBeNull();
    expect(s!.wet).toBe(false);
    expect(s!.paintWet).toBe(false);
    expect(s!.rainNow).toBe(false);
    expect(s!.puddleLikely).toBe(false);
    expect(s!.residualWaterMm).toBe(0);
    expect(s!.residualPaintWaterMm).toBe(0);
    expect(s!.hoursSinceRainEnded).toBeNull();
  });

  it('2. light rain ended 6h ago, slow drying (cool/humid/cloudy) → asphalt still damp', () => {
    // 2.0mm at hour-of-day index 17 (6h before now), then 6h of slow drying
    const hist = mkHistory(
      { temp: 8, humid: 80, wind: 5, clouds: 90 },
      { 17: { rain_mm: 2.0 } },
    );
    const s = evaluate(hist)!;

    expect(s.rainNow).toBe(false);
    expect(s.wet).toBe(true); // residual water still present
    expect(s.paintWet).toBe(true);
    expect(s.hoursSinceRainEnded).toBe(6);
    expect(s.puddleLikely).toBe(false);
    expect(s.residualWaterMm).toBeGreaterThan(1.0);
    expect(s.residualWaterMm).toBeLessThan(2.0);
  });

  it('3. sustained heavy rain in last 3h, currently dry → puddleLikely + still wet', () => {
    // 6mm + 6mm + 0mm in last 3 hours = 12mm... still under 15mm threshold.
    // 8mm + 8mm + 0mm = 16mm in last 3h → triggers puddle threshold
    const hist = mkHistory(
      { temp: 14, humid: 70, wind: 8, clouds: 80 },
      { 21: { rain_mm: 8.0 }, 22: { rain_mm: 8.0 } },
    );
    const s = evaluate(hist)!;

    expect(s.rainNow).toBe(false); // hour 23 (now) is dry
    expect(s.wet).toBe(true);
    expect(s.paintWet).toBe(true);
    expect(s.puddleLikely).toBe(true); // last3h = 16mm ≥ 15
    expect(s.hoursSinceRainEnded).toBe(1);
  });

  it('4. asphalt dries but paint still wet — common NYC failure mode', () => {
    // Goal: pick conditions so total drying done >= rainfall but < rainfall * 1.7.
    // 2mm rain at hour 18 (5h before now), then 5h of moderate drying.
    const hist = mkHistory(
      { temp: 12, humid: 60, wind: 18, clouds: 40 },
      { 18: { rain_mm: 2.0 } },
    );
    const s = evaluate(hist)!;

    expect(s.rainNow).toBe(false);
    expect(s.wet).toBe(false); // asphalt fully dry
    expect(s.paintWet).toBe(true); // paint still drying (1.7× water budget)
    expect(s.residualWaterMm).toBe(0);
    expect(s.residualPaintWaterMm).toBeGreaterThan(0);
    expect(s.hoursSinceRainEnded).toBe(5);
  });

  it('5. freezing + recent rain → wet AND freezing flags both fire', () => {
    const hist = mkHistory(
      { temp: -2, humid: 85, wind: 10, clouds: 95 },
      { 22: { rain_mm: 1.5 } }, // 1h ago
    );
    const s = evaluate(hist)!;

    expect(s.rainNow).toBe(false);
    expect(s.wet).toBe(true);
    expect(s.paintWet).toBe(true);
    expect(s.currentTemp).toBe(-2);
    expect(s.hoursSinceRainEnded).toBe(1);
  });

  it('6. active rain right now → rainNow flag set, water accumulating', () => {
    const hist = mkHistory(
      { temp: 10, humid: 85, wind: 12, clouds: 100 },
      {
        20: { rain_mm: 3.0 },
        21: { rain_mm: 4.0 },
        22: { rain_mm: 2.5 },
        23: { rain_mm: 6.0 }, // current hour — heavy enough to trigger 1h puddle threshold
      },
    );
    const s = evaluate(hist)!;

    expect(s.rainNow).toBe(true);
    expect(s.wet).toBe(true);
    expect(s.paintWet).toBe(true);
    expect(s.puddleLikely).toBe(true); // last1h = 6.0mm ≥ 5
    expect(s.hoursSinceRainEnded).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Edge cases
// ---------------------------------------------------------------------------

describe('evaluate — edge cases', () => {
  it('empty history returns null', () => {
    expect(evaluate([])).toBeNull();
  });

  it('trace rain (< 0.15mm) does not accumulate', () => {
    const hist = mkHistory(
      { temp: 18, humid: 50, wind: 10, clouds: 30 },
      { 22: { rain_mm: 0.1 } },
    );
    const s = evaluate(hist)!;
    expect(s.wet).toBe(false);
    expect(s.rainNow).toBe(false);
  });
});

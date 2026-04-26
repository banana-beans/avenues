import { describe, expect, it } from 'vitest';

import type { EvaluationState } from './drying.ts';
import { score } from './score.ts';

function mkState(overrides: Partial<EvaluationState> = {}): EvaluationState {
  return {
    wet: false,
    paintWet: false,
    rainNow: false,
    residualWaterMm: 0,
    residualPaintWaterMm: 0,
    hoursSinceRainEnded: null,
    puddleLikely: false,
    currentTemp: 18,
    currentWind: 10,
    currentHumid: 50,
    currentClouds: 30,
    ...overrides,
  };
}

describe('score', () => {
  it('1. perfectly dry day → 100, "magic day" (bike sweet spot)', () => {
    const r = score(mkState());
    expect(r.score).toBe(100);
    expect(r.band).toBe('good');
    expect(r.headline).toBe('Magic day.');
    expect(r.sweetSpot).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('1b. dry but outside sweet-spot temp → "send it" (not magic)', () => {
    const r = score(mkState({ currentTemp: 28 })); // hot for cycling sweet spot
    expect(r.score).toBe(100);
    expect(r.band).toBe('good');
    expect(r.headline).toBe('Send it.');
    expect(r.sweetSpot).toBe(false);
  });

  it('2. damp asphalt → "fair" band with penalty scaling on residual mm', () => {
    const r = score(
      mkState({
        wet: true,
        paintWet: true,
        residualWaterMm: 1.0,
        residualPaintWaterMm: 1.7,
        hoursSinceRainEnded: 4,
      }),
    );
    // Penalty = clamp(8, 8 + 1.0*12, 35) = 20 → score = 80, band = fair
    expect(r.score).toBe(80);
    expect(r.band).toBe('fair');
    expect(r.headline).toBe('Probably fine.');
    expect(r.reasons.some((s) => s.includes('rain ended 4h ago'))).toBe(true);
  });

  it('3. heavy puddles + wet → "poor" or "bad" band', () => {
    const r = score(
      mkState({
        wet: true,
        paintWet: true,
        residualWaterMm: 3.0,
        residualPaintWaterMm: 5.1,
        hoursSinceRainEnded: 1,
        puddleLikely: true,
      }),
    );
    // -25 (puddles) - clamp(8, 8+36, 35) = -25 - 35 = -60 → 40
    expect(r.score).toBe(40);
    expect(r.band).toBe('poor');
    expect(r.reasons).toContain('puddles likely on low spots');
  });

  it('4. paint-only wet → -12 penalty, still solidly "good"', () => {
    const r = score(
      mkState({
        wet: false,
        paintWet: true,
        residualPaintWaterMm: 0.6,
        hoursSinceRainEnded: 5,
      }),
    );
    expect(r.score).toBe(88);
    expect(r.band).toBe('good');
    expect(r.reasons).toContain('asphalt dry but painted lanes still slick');
  });

  it('5. freezing + recent wet → both penalties stack', () => {
    const r = score(
      mkState({
        wet: true,
        paintWet: true,
        residualWaterMm: 0.5,
        residualPaintWaterMm: 1.5,
        hoursSinceRainEnded: 1,
        currentTemp: -2,
        currentHumid: 85,
      }),
    );
    // -clamp(8, 8+6, 35)=14, -15 cold-wet, -20 freezing → 100-14-15-20 = 51
    expect(r.score).toBe(51);
    expect(r.band).toBe('poor');
    expect(r.reasons).toContain('cold + wet (ice risk near freezing)');
    expect(r.reasons).toContain('freezing — ice risk');
  });

  it('6. active rain → band always "bad", -70 penalty', () => {
    const r = score(
      mkState({
        wet: true,
        paintWet: true,
        rainNow: true,
        residualWaterMm: 2.0,
        residualPaintWaterMm: 3.4,
        hoursSinceRainEnded: 0,
      }),
    );
    // rainNow=true short-circuits other "wet" branch and sets band='bad'.
    // Penalty stack: -70 only (the wet/paintWet branch is gated on !rainNow).
    expect(r.score).toBe(30);
    expect(r.band).toBe('bad');
    expect(r.headline).toBe('It is raining.');
    expect(r.reasons).toContain('actively raining');
  });

  it('forecast precipitation in next 3h subtracts a forecast penalty', () => {
    const r = score(mkState(), [
      { rain_mm: 1.5 },
      { rain_mm: 2.0 },
      { rain_mm: 0.5 },
    ]);
    // next3h = 4.0mm; penalty = clamp(8, 8 + 4*5, 25) = 25 → score = 75
    expect(r.score).toBe(75);
    expect(r.band).toBe('fair');
    expect(r.reasons.some((s) => s.startsWith('rain incoming'))).toBe(true);
  });

  it('strong wind triggers wind penalty', () => {
    const high = score(mkState({ currentWind: 40 }));
    expect(high.score).toBe(90);
    expect(high.reasons.some((s) => s.startsWith('strong wind'))).toBe(true);

    const gusty = score(mkState({ currentWind: 30 }));
    expect(gusty.score).toBe(95);
    expect(gusty.reasons.some((s) => s.startsWith('gusty'))).toBe(true);
  });

  // ---------------------------------------------------------------------
  // Run mode
  // ---------------------------------------------------------------------

  it('run mode: cool dry day → 100, sweet-spot magic conditions', () => {
    const r = score(
      mkState({ currentTemp: 9, currentHumid: 50, currentWind: 8, currentClouds: 40 }),
      [],
      { mode: 'run', apparentTempC: 9 },
    );
    expect(r.score).toBe(100);
    expect(r.band).toBe('good');
    expect(r.headline).toBe('Magic conditions.');
    expect(r.sweetSpot).toBe(true);
  });

  it('run mode: dangerous heat → poor band with heat reason and warning headline', () => {
    const r = score(
      mkState({ currentTemp: 35, currentHumid: 80 }),
      [],
      { mode: 'run', apparentTempC: 40 },
    );
    // -40 dangerous heat + -8 humidWarm = 52. In 'poor' band [40, 64].
    expect(r.score).toBeLessThan(65);
    expect(r.score).toBeGreaterThanOrEqual(40);
    expect(r.band).toBe('poor');
    expect(r.headline).toBe('Dangerous heat.');
    expect(r.reasons.some((s) => s.includes('dangerous heat'))).toBe(true);
  });

  it('run mode: warm + humid stacks the humidWarm penalty', () => {
    const r = score(
      mkState({ currentTemp: 25, currentHumid: 85 }),
      [],
      { mode: 'run', apparentTempC: 28 },
    );
    expect(r.reasons).toContain('humid (slows sweat evaporation)');
  });

  it('run mode: rain is less punishing than bike (rainNow penalty 25 vs 70)', () => {
    const rainState = mkState({
      rainNow: true,
      wet: true,
      paintWet: true,
      residualWaterMm: 1.0,
      hoursSinceRainEnded: 0,
    });
    const bike = score(rainState);
    const run = score(rainState, [], { mode: 'run', apparentTempC: 18 });
    expect(run.score).toBeGreaterThan(bike.score);
    expect(run.headline).toBe('It is raining.');
  });

  it('run mode: extreme cold (T <= -10) stacks frostbite penalty', () => {
    const r = score(
      mkState({ currentTemp: -12, currentHumid: 50 }),
      [],
      { mode: 'run', apparentTempC: -18 },
    );
    expect(r.reasons).toContain('extreme cold (frostbite risk)');
    expect(r.reasons).toContain('freezing — icy patches');
  });

  it('run mode: paint-only wet does NOT penalize runners', () => {
    const paintWetOnly = mkState({
      wet: false,
      paintWet: true,
      residualPaintWaterMm: 0.6,
      hoursSinceRainEnded: 5,
    });
    const r = score(paintWetOnly, [], { mode: 'run', apparentTempC: 12 });
    // Bike gets -12 here; run gets nothing for paint-only.
    expect(r.score).toBe(100);
  });

  it('score is clamped to [0, 100]', () => {
    const r = score(
      mkState({
        rainNow: true,
        wet: true,
        paintWet: true,
        puddleLikely: true,
        residualWaterMm: 10,
        residualPaintWaterMm: 17,
        currentTemp: -5,
        currentWind: 50,
        hoursSinceRainEnded: 0,
      }),
      [{ rain_mm: 5 }, { rain_mm: 5 }, { rain_mm: 5 }],
    );
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

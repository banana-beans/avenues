import { describe, expect, it } from 'vitest';

import {
  haversineMetres,
  METRES_PER_MILE,
  RunTracker,
  type PositionFix,
} from './tracker.ts';

// NYC anchor — Battery Park area. Tracker is geometry-only so any anchor works.
const ORIGIN = { lat: 40.7033, lon: -74.0170 };

/** Approx metres-per-degree at NYC latitude (used to construct synthetic fixes). */
const M_PER_DEG_LAT = 111_000;
const M_PER_DEG_LON = 84_300; // cos(40.7°) * 111_000

function fixAt(t: number, dxNorthM: number, dyEastM: number, accuracy = 5): PositionFix {
  return {
    t,
    lat: ORIGIN.lat + dxNorthM / M_PER_DEG_LAT,
    lon: ORIGIN.lon + dyEastM / M_PER_DEG_LON,
    accuracy,
  };
}

describe('haversineMetres', () => {
  it('returns zero for identical points', () => {
    const p = fixAt(0, 0, 0);
    expect(haversineMetres(p, p)).toBe(0);
  });

  it('matches the small-angle approximation within ~1% for short distances', () => {
    const a = fixAt(0, 0, 0);
    const b = fixAt(0, 100, 0); // 100m due north
    const d = haversineMetres(a, b);
    expect(d).toBeGreaterThan(99);
    expect(d).toBeLessThan(101);
  });

  it('symmetric in argument order', () => {
    const a = fixAt(0, 0, 0);
    const b = fixAt(0, 250, 250);
    expect(haversineMetres(a, b)).toBeCloseTo(haversineMetres(b, a), 6);
  });
});

describe('RunTracker', () => {
  it('starts and stops, reports duration in ms', () => {
    const t = new RunTracker();
    t.start(1000);
    const snap = t.stop(7000);
    expect(snap.running).toBe(false);
    expect(snap.duration_ms).toBe(6000);
    expect(snap.distance_m).toBe(0);
  });

  it('accumulates distance from a steady stream of fixes', () => {
    const t = new RunTracker();
    t.start(0);
    // 5 fixes, 100m apart north, 30s apart → 500m total
    for (let i = 1; i <= 5; i++) {
      t.ingest(fixAt(i * 30_000, i * 100, 0));
    }
    const snap = t.stop(150_000);
    expect(snap.distance_m).toBeGreaterThan(395);
    expect(snap.distance_m).toBeLessThan(405);
  });

  it('emits a split exactly once when the first mile is crossed', () => {
    const t = new RunTracker();
    t.start(0);
    // 10 fixes, 213m apart → 9 accepted deltas → ~1917m, crosses 1 mile.
    // (First fix only sets the baseline; deltas accumulate from the second.)
    let crossed = false;
    for (let i = 1; i <= 10; i++) {
      const result = t.ingest(fixAt(i * 60_000, i * 213, 0));
      if (result.newSplits.length > 0) {
        expect(result.newSplits.map((s) => s.mile)).toEqual([1]);
        // The split's totalMs is the timestamp of the fix that crossed.
        expect(result.newSplits[0]!.totalMs).toBe(i * 60_000);
        crossed = true;
        break;
      }
    }
    expect(crossed).toBe(true);
  });

  it('reports cumulative + per-split times correctly across two miles', () => {
    const t = new RunTracker();
    t.start(0);
    // Walk forward 50m every second until 2.5 miles. Constant 50 m/s is not
    // physical but speed-filter is 8 m/s — we want this filtered. Use 5 m/s.
    let n = 0;
    const stepM = 5;
    const stepMs = 1000;
    while (true) {
      n++;
      t.ingest(fixAt(n * stepMs, n * stepM, 0));
      if (n * stepM > 2.5 * METRES_PER_MILE) break;
      // Defensive: never accumulate more than ~3 miles of fixes.
      if (n > 2000) throw new Error('runaway loop');
    }
    const snap = t.stop(n * stepMs);
    expect(snap.splits.length).toBe(2);
    // Split 1 finished when distance crossed 1 mile (at fix index ~322,
    // since 322 * 5 = 1610). Time at that fix is ~322s.
    const s1 = snap.splits[0]!;
    const s2 = snap.splits[1]!;
    expect(s1.mile).toBe(1);
    expect(s2.mile).toBe(2);
    // Each "5 m/s" mile takes ~322s; allow ±2s slack for boundary discretization.
    expect(s1.splitMs).toBeGreaterThan(320_000);
    expect(s1.splitMs).toBeLessThan(324_000);
    expect(s2.splitMs).toBeGreaterThan(320_000);
    expect(s2.splitMs).toBeLessThan(324_000);
    // Cumulative monotonic.
    expect(s2.totalMs).toBeGreaterThan(s1.totalMs);
  });

  it('drops fixes with poor accuracy', () => {
    const t = new RunTracker();
    t.start(0);
    t.ingest(fixAt(1000, 0, 0)); // good
    t.ingest(fixAt(2000, 100, 0, 80)); // bad accuracy
    const snap = t.snapshot(3000);
    expect(snap.distance_m).toBe(0);
  });

  it('rejects implausibly fast jumps (GPS jitter)', () => {
    const t = new RunTracker();
    t.start(0);
    t.ingest(fixAt(1000, 0, 0));
    // 100m in 1s → 100 m/s, way above 8 m/s ceiling: distance should not jump
    t.ingest(fixAt(2000, 100, 0));
    const snap = t.snapshot(2000);
    expect(snap.distance_m).toBe(0);
  });

  it('ignores fixes received before start()', () => {
    const t = new RunTracker();
    t.ingest(fixAt(1000, 0, 0));
    expect(t.snapshot(5000).distance_m).toBe(0);
    expect(t.snapshot(5000).running).toBe(false);
  });

  it('ignores fixes received after stop()', () => {
    const t = new RunTracker();
    t.start(0);
    t.ingest(fixAt(1000, 0, 0));
    t.ingest(fixAt(2000, 5, 0));
    const beforeStop = t.snapshot(2000).distance_m;
    t.stop(3000);
    t.ingest(fixAt(4000, 100, 0));
    expect(t.snapshot(5000).distance_m).toBe(beforeStop);
  });

  it('skips out-of-order fixes without crashing', () => {
    const t = new RunTracker();
    t.start(0);
    t.ingest(fixAt(2000, 0, 0));
    // Earlier timestamp than previous — ignore
    const result = t.ingest(fixAt(1000, 5, 0));
    expect(result.newSplits).toEqual([]);
    expect(result.snapshot.distance_m).toBe(0);
  });
});

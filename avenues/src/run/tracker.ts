/**
 * Run tracker — pure state machine.
 *
 * Takes timestamped position fixes in, emits accumulated distance, splits at
 * each crossed mile boundary, and a final summary on stop. No browser APIs
 * touched here — the imperative shells live in `geo.ts` / `speech.ts` /
 * `wakeLock.ts` and call into this module.
 *
 * Distance accumulation uses Haversine on consecutive fixes. We reject fixes
 * with implausible accuracy (> 50m) and implausible inter-fix speed (> 8 m/s,
 * faster than world-record sprint pace) to filter GPS jitter.
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Mean Earth radius, metres. */
const EARTH_RADIUS_M = 6_371_000;

/** Metres per international mile. */
export const METRES_PER_MILE = 1609.344;

/** Reject fixes with reported accuracy worse than this. */
const MAX_ACCURACY_M = 50;

/**
 * Reject implied speeds above this between consecutive fixes (m/s). Bolt's
 * 100m WR averages ~10.4 m/s; sustained 8 m/s would be a 3:21 mile, well
 * faster than any non-elite runner. Anything above is GPS jitter.
 */
const MAX_PLAUSIBLE_SPEED_MPS = 8;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PositionFix {
  /** Unix ms timestamp of the fix. */
  readonly t: number;
  readonly lat: number;
  readonly lon: number;
  /** Reported horizontal accuracy in metres (Geolocation API standard). */
  readonly accuracy: number;
}

export interface Split {
  /** 1-indexed mile number that was just completed. */
  readonly mile: number;
  /** Time (ms) just for this mile. */
  readonly splitMs: number;
  /** Cumulative time (ms) from the start of the run. */
  readonly totalMs: number;
}

export interface TrackerSnapshot {
  readonly running: boolean;
  /** Cumulative distance in metres. */
  readonly distance_m: number;
  /** Elapsed time in ms. While running, this advances with each fix; after
   *  stop it's frozen. */
  readonly duration_ms: number;
  readonly splits: readonly Split[];
  /** Last accepted fix; null until the first one arrives. */
  readonly lastFix: PositionFix | null;
}

export interface IngestResult {
  readonly snapshot: TrackerSnapshot;
  /** Splits crossed *by this fix*. Usually 0 or 1; could be >1 if a fix lands
   *  far past a boundary (e.g. tunnel exit). Caller speaks each one. */
  readonly newSplits: readonly Split[];
}

// ---------------------------------------------------------------------------
// Tracker
// ---------------------------------------------------------------------------

export class RunTracker {
  private startedAt: number | null = null;
  private stoppedAt: number | null = null;
  private distanceM = 0;
  private last: PositionFix | null = null;
  private splits: Split[] = [];
  /** Boundary index (1, 2, 3 ...) of the *next* mile we expect to cross. */
  private nextMile = 1;
  /** Cumulative time at the moment the previous mile boundary was crossed. */
  private lastSplitMs = 0;

  start(now: number): void {
    this.startedAt = now;
    this.stoppedAt = null;
    this.distanceM = 0;
    this.last = null;
    this.splits = [];
    this.nextMile = 1;
    this.lastSplitMs = 0;
  }

  stop(now: number): TrackerSnapshot {
    if (this.startedAt != null && this.stoppedAt == null) {
      this.stoppedAt = now;
    }
    return this.snapshot();
  }

  /**
   * Ingest a position fix. Returns a snapshot plus any newly-crossed splits.
   * Fixes with poor accuracy or implausible speed are silently dropped.
   */
  ingest(fix: PositionFix): IngestResult {
    if (this.startedAt == null || this.stoppedAt != null) {
      return { snapshot: this.snapshot(), newSplits: [] };
    }
    if (!isFinite(fix.lat) || !isFinite(fix.lon)) {
      return { snapshot: this.snapshot(), newSplits: [] };
    }
    if (fix.accuracy > MAX_ACCURACY_M) {
      return { snapshot: this.snapshot(), newSplits: [] };
    }

    if (this.last == null) {
      this.last = fix;
      return { snapshot: this.snapshot(), newSplits: [] };
    }

    const delta = haversineMetres(this.last, fix);
    const dt = (fix.t - this.last.t) / 1000;
    if (dt <= 0) {
      // Out-of-order fix — skip without advancing state.
      return { snapshot: this.snapshot(), newSplits: [] };
    }
    const speed = delta / dt;
    if (speed > MAX_PLAUSIBLE_SPEED_MPS) {
      // GPS jitter spike: keep the fix as the new "last" so future deltas are
      // measured from the corrected position, but don't add this jump to dist.
      this.last = fix;
      return { snapshot: this.snapshot(), newSplits: [] };
    }

    this.distanceM += delta;
    this.last = fix;

    const newSplits: Split[] = [];
    while (this.distanceM >= this.nextMile * METRES_PER_MILE) {
      const totalMs = fix.t - this.startedAt;
      const splitMs = totalMs - this.lastSplitMs;
      const split: Split = { mile: this.nextMile, splitMs, totalMs };
      this.splits.push(split);
      newSplits.push(split);
      this.lastSplitMs = totalMs;
      this.nextMile += 1;
    }

    return { snapshot: this.snapshot(), newSplits };
  }

  snapshot(now: number = Date.now()): TrackerSnapshot {
    const startedAt = this.startedAt;
    const running = startedAt != null && this.stoppedAt == null;
    let duration = 0;
    if (startedAt != null) {
      const end = this.stoppedAt ?? now;
      duration = Math.max(0, end - startedAt);
    }
    return {
      running,
      distance_m: this.distanceM,
      duration_ms: duration,
      splits: [...this.splits],
      lastFix: this.last,
    };
  }
}

// ---------------------------------------------------------------------------
// Math
// ---------------------------------------------------------------------------

/** Great-circle distance between two coordinates in metres. */
export function haversineMetres(a: PositionFix, b: PositionFix): number {
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const dLat = toRadians(b.lat - a.lat);
  const dLon = toRadians(b.lon - a.lon);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLon * sinDLon;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}

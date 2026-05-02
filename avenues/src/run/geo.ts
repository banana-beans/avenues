/**
 * Thin wrapper over `navigator.geolocation.watchPosition` that emits typed
 * {@link PositionFix} objects. The tracker stays pure; this is the only file
 * that touches the Geolocation API.
 */

import type { PositionFix } from './tracker.ts';

export interface GeoWatchHandlers {
  onFix: (fix: PositionFix) => void;
  /** Called once on watch failure (permission denied, no signal, etc). */
  onError?: (error: GeolocationPositionError) => void;
}

export interface GeoWatch {
  /** Stop the watch. Idempotent. */
  stop(): void;
}

const WATCH_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  // Don't accept fixes older than 10s — staleness inflates jitter rejection.
  maximumAge: 10_000,
  // Wait up to 30s for the first fix; subsequent updates flow naturally.
  timeout: 30_000,
};

export function startGeoWatch(handlers: GeoWatchHandlers): GeoWatch {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    handlers.onError?.({
      code: 2,
      message: 'Geolocation API not available',
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
    } as GeolocationPositionError);
    return { stop: () => {} };
  }

  const id = navigator.geolocation.watchPosition(
    (pos) => {
      handlers.onFix({
        t: pos.timestamp,
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      });
    },
    (err) => handlers.onError?.(err),
    WATCH_OPTIONS,
  );

  let stopped = false;
  return {
    stop() {
      if (stopped) return;
      stopped = true;
      navigator.geolocation.clearWatch(id);
    },
  };
}

/**
 * Persistence layer.
 *
 * v1 backs onto `localStorage`. Behind a small async interface so swapping to
 * IndexedDB later is a one-file change (per CLAUDE.md). All reads are
 * resilient: corrupt JSON or schema drift returns a safe fallback instead of
 * crashing the app.
 */

import type { Location, Mode, RideLogEntry } from './types.ts';

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface PersistenceLayer {
  getLocations(): Promise<Location[] | null>;
  setLocations(locs: readonly Location[]): Promise<void>;
  getLog(): Promise<RideLogEntry[]>;
  setLog(log: readonly RideLogEntry[]): Promise<void>;
  getMode(): Promise<Mode>;
  setMode(mode: Mode): Promise<void>;
}

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

const KEY_LOCATIONS = 'avenues:locations';
const KEY_LOG = 'avenues:log';
const KEY_MODE = 'avenues:mode';

/** Cap the log to keep localStorage bounded. Migrate to IndexedDB if this hurts. */
const LOG_MAX_ENTRIES = 200;

// ---------------------------------------------------------------------------
// Storage abstraction (DOM Storage interface, narrowed to what we use)
// ---------------------------------------------------------------------------

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createLocalStoragePersistence(
  store: KeyValueStore = globalThis.localStorage,
): PersistenceLayer {
  return {
    async getLocations() {
      const raw = store.getItem(KEY_LOCATIONS);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return null;
        return parsed as Location[];
      } catch {
        return null;
      }
    },

    async setLocations(locs) {
      store.setItem(KEY_LOCATIONS, JSON.stringify(locs));
    },

    async getLog() {
      const raw = store.getItem(KEY_LOG);
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed as RideLogEntry[];
      } catch {
        return [];
      }
    },

    async setLog(log) {
      const trimmed = log.slice(0, LOG_MAX_ENTRIES);
      store.setItem(KEY_LOG, JSON.stringify(trimmed));
    },

    async getMode() {
      const raw = store.getItem(KEY_MODE);
      return raw === 'run' ? 'run' : 'bike';
    },

    async setMode(mode) {
      store.setItem(KEY_MODE, mode);
    },
  };
}

// ---------------------------------------------------------------------------
// In-memory implementation — useful for tests + SSR safety
// ---------------------------------------------------------------------------

export function createMemoryStore(initial: Record<string, string> = {}): KeyValueStore {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

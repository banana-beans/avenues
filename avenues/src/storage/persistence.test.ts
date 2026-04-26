import { describe, expect, it } from 'vitest';

import { createLocalStoragePersistence, createMemoryStore } from './persistence.ts';
import type { Location, RideLogEntry } from './types.ts';

const SAMPLE_LOC: Location = {
  id: 'home',
  name: 'HOME',
  lat: 40.6,
  lon: -74,
  role: 'primary',
};

const SAMPLE_RIDE: RideLogEntry = {
  ts: 1_700_000_000_000,
  locId: 'home',
  locName: 'HOME',
  note: 'commute',
  score: 87,
  band: 'good',
  conditions: { temp: 18, wind: 10, humid: 50, rainNow: false, wet: false },
};

describe('createLocalStoragePersistence', () => {
  it('round-trips locations through the store', async () => {
    const store = createMemoryStore();
    const p = createLocalStoragePersistence(store);

    expect(await p.getLocations()).toBeNull();
    await p.setLocations([SAMPLE_LOC]);
    expect(await p.getLocations()).toEqual([SAMPLE_LOC]);
  });

  it('round-trips ride log entries', async () => {
    const p = createLocalStoragePersistence(createMemoryStore());

    expect(await p.getLog()).toEqual([]);
    await p.setLog([SAMPLE_RIDE]);
    expect(await p.getLog()).toEqual([SAMPLE_RIDE]);
  });

  it('returns safe fallbacks for corrupt JSON instead of throwing', async () => {
    const store = createMemoryStore({
      'avenues:locations': '{ malformed',
      'avenues:log': 'not json at all',
    });
    const p = createLocalStoragePersistence(store);

    expect(await p.getLocations()).toBeNull();
    expect(await p.getLog()).toEqual([]);
  });

  it('caps the ride log at 200 entries', async () => {
    const store = createMemoryStore();
    const p = createLocalStoragePersistence(store);
    const log: RideLogEntry[] = Array.from({ length: 250 }, (_, i) => ({
      ...SAMPLE_RIDE,
      ts: i,
    }));

    await p.setLog(log);
    const back = await p.getLog();
    expect(back.length).toBe(200);
    expect(back[0]?.ts).toBe(0); // oldest preserved is index 0 (slice keeps the head)
  });
});

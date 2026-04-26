import { describe, expect, it } from 'vitest';

import { buildBackup, readBackupFile } from './backup.ts';
import type { Location, RideLogEntry } from './types.ts';

const LOC: Location = { id: 'home', name: 'HOME', lat: 40.6, lon: -74, role: 'primary' };
const RIDE: RideLogEntry = {
  ts: 1_700_000_000_000,
  locId: 'home',
  locName: 'HOME',
  note: '',
  score: 87,
  band: 'good',
  conditions: { temp: 18, wind: 10, humid: 50, rainNow: false, wet: false },
};

function fileFromString(name: string, body: string): File {
  return new File([body], name, { type: 'application/json' });
}

describe('backup', () => {
  it('round-trips locations + log through buildBackup → JSON → readBackupFile', async () => {
    const payload = buildBackup([LOC], [RIDE]);
    const file = fileFromString('avenues-backup-2026-04-26.json', JSON.stringify(payload));

    const restored = await readBackupFile(file);

    expect(restored.locations).toEqual([LOC]);
    expect(restored.log).toEqual([RIDE]);
    expect(restored.version).toBe(1);
  });

  it('rejects non-JSON files', async () => {
    const file = fileFromString('garbage.json', 'not json at all');
    await expect(readBackupFile(file)).rejects.toThrow();
  });

  it('rejects JSON that is not an avenues backup payload', async () => {
    const file = fileFromString('other.json', JSON.stringify({ foo: 'bar' }));
    await expect(readBackupFile(file)).rejects.toThrow(/schema mismatch/);
  });

  it('rejects backups with a different version', async () => {
    const file = fileFromString(
      'future.json',
      JSON.stringify({ version: 99, exportedAt: 'now', locations: [], log: [] }),
    );
    await expect(readBackupFile(file)).rejects.toThrow(/schema mismatch/);
  });
});

/**
 * Backup / restore for locations + ride log.
 *
 * Pure local — produces a JSON download (export) or accepts a File (import).
 * Schema is versioned so older backups can be migrated on read if we change
 * the storage shape.
 */

import type { Location, RideLogEntry } from './types.ts';

export interface BackupPayload {
  readonly version: 1;
  /** ISO-8601 UTC timestamp of when this backup was made. */
  readonly exportedAt: string;
  readonly locations: readonly Location[];
  readonly log: readonly RideLogEntry[];
}

export function buildBackup(
  locations: readonly Location[],
  log: readonly RideLogEntry[],
): BackupPayload {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    locations,
    log,
  };
}

/** Trigger a JSON file download in the browser. */
export function downloadBackup(payload: BackupPayload): void {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const stamp = payload.exportedAt.slice(0, 10); // YYYY-MM-DD
  const a = document.createElement('a');
  a.href = url;
  a.download = `avenues-backup-${stamp}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Read + validate a user-supplied backup file. Throws on schema mismatch. */
export async function readBackupFile(file: File): Promise<BackupPayload> {
  const text = await file.text();
  const parsed: unknown = JSON.parse(text);
  if (!isBackupPayload(parsed)) {
    throw new Error('Not an avenues backup file (schema mismatch).');
  }
  return parsed;
}

function isBackupPayload(x: unknown): x is BackupPayload {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  return (
    o.version === 1 &&
    typeof o.exportedAt === 'string' &&
    Array.isArray(o.locations) &&
    Array.isArray(o.log)
  );
}

/**
 * Types for everything we persist locally.
 *
 * Stable public schema — bumping the storage key (see `persistence.ts`) is the
 * migration mechanism. Don't add required fields to existing types without a
 * migration.
 */

export type Mode = 'bike' | 'run';

export type LocationRole = 'primary' | 'secondary';

export interface Location {
  /** Stable opaque ID (e.g. `loc_lq3p2k`). */
  readonly id: string;
  /** UPPERCASE display label. */
  readonly name: string;
  readonly lat: number;
  readonly lon: number;
  readonly role: LocationRole;
}

/** Snapshot of conditions at the moment a ride was logged. */
export interface RideConditions {
  readonly temp: number;
  readonly wind: number;
  readonly humid: number;
  readonly rainNow: boolean;
  readonly wet: boolean;
}

export type ScoreBand = 'good' | 'fair' | 'poor' | 'bad';

export interface RideLogEntry {
  /** Unix ms timestamp the ride was logged. */
  readonly ts: number;
  readonly locId: string;
  /** Denormalized: `loc.name` at the time of logging, in case the loc is later renamed/deleted. */
  readonly locName: string;
  readonly note: string;
  readonly score: number;
  readonly band: ScoreBand;
  readonly conditions: RideConditions;
  /** Activity mode at the time of logging. Older entries default to 'bike'. */
  readonly mode?: Mode;
}

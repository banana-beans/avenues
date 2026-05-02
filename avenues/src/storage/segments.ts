/**
 * Leg definitions — pairs of saved locations representing actual rides or runs.
 * Each leg is scored as the worse of its two endpoint scores (weakest mile wins).
 *
 * `mode` declares which activity a leg applies to. Run-only legs only render in
 * RUN mode, bike-only in BIKE mode, and 'both' shows up in either.
 *
 * `↔` notation: scoring is direction-agnostic right now because the model
 * evaluates a snapshot in time, so A→B and B→A produce identical scores.
 * Future morning/evening projection could split these.
 */

import type { Mode } from './types.ts';

export type LegMode = Mode | 'both';

export interface Leg {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly label: string;
  readonly mode: LegMode;
}

/**
 * Default legs use only the IDs in {@link DEFAULT_LOCATIONS} so the section
 * actually populates on first run. Personal commute-specific legs (e.g. Benny's
 * ferry-based hops) live in `docs/personal-locations.json` and arrive via the
 * IMPORT button — they reference IDs that aren't in the public defaults.
 */
export const DEFAULT_LEGS: readonly Leg[] = [
  // Bike-only — generic urban commute
  {
    id: 'home-office-bike',
    fromId: 'home',
    toId: 'office',
    label: 'HOME ↔ OFFICE',
    mode: 'bike',
  },
  {
    id: 'office-gym-bike',
    fromId: 'office',
    toId: 'gym',
    label: 'OFFICE ↔ GYM',
    mode: 'bike',
  },
  // Run-only — East River Greenway loop, hits FDR
  {
    id: 'home-fdr-run',
    fromId: 'home',
    toId: 'fdr',
    label: 'HOME ↔ FDR',
    mode: 'run',
  },
  // Both — short cross-town hop, valid in either mode
  {
    id: 'home-gym',
    fromId: 'home',
    toId: 'gym',
    label: 'HOME ↔ GYM',
    mode: 'both',
  },
];

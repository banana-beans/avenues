/**
 * Bike-leg definitions — pairs of seeded locations that represent actual
 * rides Benny does on his commute. Each leg is scored as the worse of its
 * two endpoint scores (weakest mile wins).
 *
 * `↔` notation: scoring is direction-agnostic right now because the model
 * evaluates a snapshot in time, so A→B and B→A produce identical scores.
 * Future morning/evening projection could split these.
 */

export interface BikeLeg {
  readonly id: string;
  readonly fromId: string;
  readonly toId: string;
  readonly label: string;
}

export const DEFAULT_BIKE_LEGS: readonly BikeLeg[] = [
  {
    id: 'home-stgeorge',
    fromId: 'home',
    toId: 'ferry-si',
    label: 'HOME ↔ ST. GEORGE',
  },
  {
    id: 'whitehall-office',
    fromId: 'ferry-ny',
    toId: 'office',
    label: 'WHITEHALL ↔ OFFICE',
  },
  {
    id: 'office-gym',
    fromId: 'office',
    toId: 'gym',
    label: 'OFFICE ↔ GYM',
  },
  {
    id: 'whitehall-gym',
    fromId: 'ferry-ny',
    toId: 'gym',
    label: 'WHITEHALL ↔ GYM',
  },
];

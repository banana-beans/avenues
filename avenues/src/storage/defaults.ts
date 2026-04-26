/**
 * Seed locations used on first run (or via "Reset to defaults") when
 * localStorage is empty or the user explicitly wipes it.
 *
 * IMPORTANT: These ship in the public JS bundle. They must NOT identify any
 * specific user's residence or commute. Use generic NYC landmarks here.
 * Personal locations live outside the bundle in `docs/personal-locations.json`,
 * imported via the DATA → IMPORT button on the user's own device.
 *
 *   HOME    — generic Lower Manhattan (City Hall area, public)
 *   OFFICE  — generic Midtown (Times Square, public)
 *   GYM     — Chelsea Piers (public commercial gym)
 *   FDR     — East River Greenway (public corridor, used in RUN mode)
 */

import type { Location } from './types.ts';

export const DEFAULT_LOCATIONS: readonly Location[] = [
  {
    id: 'home',
    name: 'HOME',
    lat: 40.7128,
    lon: -74.006,
    role: 'primary',
  },
  {
    id: 'office',
    name: 'OFFICE',
    lat: 40.758,
    lon: -73.9855,
    role: 'secondary',
  },
  {
    id: 'gym',
    name: 'GYM',
    lat: 40.7488,
    lon: -74.0086,
    role: 'secondary',
  },
  {
    id: 'fdr',
    name: 'FDR',
    lat: 40.7335,
    lon: -73.9745,
    role: 'secondary',
  },
];

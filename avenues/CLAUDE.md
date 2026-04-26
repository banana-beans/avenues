# avenues

NYC cycling conditions tool. Personal project (Benny). Static SPA, deploys to
Vercel. Started as a "wetness check" but designed to grow toward a hyperlocal
NYC bike intelligence layer (hazards, Citi Bike integration, route surface
scoring).

Working name comes from NYC's avenue grid — the central organizing logic of
how cyclists move through the city.

## Stack

- **Build**: Vite + TypeScript (strict). No framework — vanilla DOM is the
  right tool for a UI this small. If component count exceeds ~15, revisit.
- **Maps**: MapLibre GL + Protomaps tiles (free, self-hostable). Custom dark
  asphalt style in `public/map-style.json`. Mapbox is the fallback if
  Protomaps coverage gaps appear in NYC.
- **Weather**: Open-Meteo forecast API (free, no key, CORS-enabled). See
  `src/data/openmeteo.ts`. Past 24h via `past_days=1`, forecast via
  `forecast_days=2`.
- **Storage**: localStorage for v1 (locations, ride log). Migrate to IndexedDB
  if ride log exceeds ~1000 entries.
- **Hosting**: Vercel. Free tier covers everything. Serverless functions
  available under `api/` if a backend is ever needed (e.g. caching Citi Bike
  GBFS, server-side hazard aggregation).
- **Testing**: Vitest. The drying model has a calibrated test suite — DO NOT
  modify coefficients without running tests and updating expectations.

## What this does

Given a saved location (lat/lon), produce a "rideability" score 0–100 with a
plain-English verdict ("send it" / "probably fine" / "skip it"). The score
combines:

- Current weather (rain, temp, wind, humidity, cloud cover)
- Surface wetness (estimated via empirical hourly water-balance model)
- Painted-surface state (paint stays slick longer than asphalt)
- Forecast precipitation in next 3h
- Cold + ice risk

Three views: right-now per-location cards, commute-window projections (next
morning + evening), 18h forecast strip.

## The drying model — most important file in the repo

`src/model/drying.ts`. This is the heart of the product and the part that
deserves the most rigor. Architecture:

1. **Hourly water-balance**: walk the past 24h hourly weather data. Each hour
   either adds rainfall_mm to a "surface water" accumulator or subtracts a
   drying potential calculated from temp × wind × humidity × cloud factors.
2. **Painted-surface accumulator**: parallel calculation with a 1.7×
   multiplier on rainfall (paint absorbs water similarly but releases it
   ~70% slower because of lower porosity and surface texture).
3. **Standing water detector**: flags puddle-likely conditions when last-1h
   rain ≥ 5mm OR last-3h rain ≥ 15mm.
4. **Score function**: starts at 100, subtracts penalties. Penalties stack;
   freezing temps + recent rain triggers the largest combined penalty (ice
   risk).

Coefficients live in `src/model/coefficients.ts`. They are NOT first-
principles physics — they are tuned to give plausible NYC outputs. Treat them
as hyperparameters to be calibrated against real ride data over time.

When user logs a ride, capture conditions snapshot + their post-ride feedback
("model said dry, was actually slick") in the ride log. The
`src/calibrate/backfit.ts` module is where future tuning logic lives.

## Locations (Benny-specific defaults)

- **Home**: Bay Ridge, Brooklyn — 40.6262, -74.0327
- **Office**: Severud Associates, Midtown — exact coords TBD by Benny
- Additional spots: TBD (gym, climbing gym, regular ride start points)

These are seeded in `src/storage/defaults.ts`. User edits override defaults
and persist in localStorage.

## Important constraints / non-negotiables

- **Accuracy over speed.** Per Benny's preferences. If a calculation could be
  more precise at the cost of a few ms, take the precision.
- **No tracking, no analytics, no third-party scripts.** Single-user product.
  Privacy by default.
- **Aesthetic**: instrument-panel / weather-station. Dark asphalt palette,
  paper cream text, sodium/rust/oxide signal colors. Fonts: Archivo Narrow
  (display), JetBrains Mono (data), Instrument Serif (italic accents). NEVER
  use Inter or system-ui — they look generic. See `src/ui/styles.css` for the
  CSS variable palette.
- **Mobile first.** Benny checks this from his phone before commuting.
  Breakpoint at 768px, primary-card collapses to single column, 96px score.
- **Offline-friendly.** PWA with service worker that caches the shell and the
  last successful weather response per location. If the user opens the app
  with no signal, show last-known data with a clear "stale, last updated Xh
  ago" banner.

## Roadmap (in priority order)

1. **v1 — port from wetcheck.html** — strict TypeScript, real test suite for
   the drying model, MapLibre map showing locations, deploy to Vercel.
2. **v1.1 — PWA** — manifest, service worker, "Add to Home Screen" UX. So it
   lives on Benny's phone home screen.
3. **v2 — Citi Bike layer** — overlay nearest dock availability via GBFS feed.
   Useful when home bike is in the shop or weather flips mid-day.
4. **v2.1 — polyline routing** — sample weather at multiple points along a
   route polyline (Bay Ridge → Midtown is ~12 miles, microclimates differ).
   Score the worst segment, not the average.
5. **v3 — calibration mode** — after each logged ride, prompt "model said X,
   was actually Y?" and back-fit coefficients. Lightweight gradient descent
   on the few hyperparameters in `coefficients.ts`.
6. **v4 (maybe) — hazard reports** — pothole pins, broken glass, construction.
   This is where the project converges with the original "Waze for bikes"
   idea. Only worth building if Benny actually rides enough to populate it
   solo, or if friends opt in.

## Open questions

- Validate drying coefficients against real ride observations (need ~20
  logged rides across varied conditions before any back-fitting is meaningful).
- Should the score weight things differently for road bike vs commuter? Road
  tires + slick paint is much worse than 32mm tires + slick paint. Currently
  the model assumes commuter-bike tolerance.
- Bridge corridors (Manhattan, Williamsburg, Brooklyn, Queensboro) have very
  different microclimates due to wind exposure. Worth special-casing?

## Conventions

- Path alias: `@/` → `src/`
- All public API surfaces (anything exported from `src/data/` or `src/model/`)
  must have explicit return types. Don't rely on inference for module
  boundaries.
- Tests live next to source: `drying.ts` ↔ `drying.test.ts`. Run tests with
  `pnpm test`.
- Commit style: Conventional Commits (`feat:`, `fix:`, `refactor:`,
  `chore:`). One logical change per commit.
- Branch naming: `feat/citi-bike-layer`, `fix/drying-cold-edge-case`.

## Local dev

```bash
pnpm install
pnpm dev          # vite, http://localhost:5173
pnpm test         # vitest
pnpm test --watch # tdd loop
pnpm build        # production build to dist/
pnpm preview      # serve dist/ locally
```

## Deploy

```bash
# First time only
vercel link

# Deploy preview
vercel

# Deploy to prod (avenues.bike)
vercel --prod
```

Domain: `avenues.bike` (purchase via Namecheap or Cloudflare Registrar).
Vercel handles SSL automatically.

## File map

```
avenues/
├── CLAUDE.md                    # ← you are here
├── README.md                    # public-facing readme
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
├── index.html                   # entry; PWA manifest linked
├── public/
│   ├── manifest.webmanifest
│   ├── map-style.json           # MapLibre dark asphalt style
│   └── icons/                   # PWA icons, 192/512/maskable
├── src/
│   ├── main.ts                  # bootstrap, mounts UI
│   ├── ui/
│   │   ├── styles.css           # CSS vars + global styles
│   │   ├── PrimaryVerdict.ts    # top score block
│   │   ├── LocationCard.ts      # secondary location cards
│   │   ├── ForecastStrip.ts     # 18h timeline
│   │   ├── CommuteWindows.ts    # morning/evening projections
│   │   ├── RideLog.ts           # log table + add ride
│   │   ├── LocationModal.ts     # add/edit location
│   │   └── Map.ts               # MapLibre integration (v1)
│   ├── model/
│   │   ├── drying.ts            # ★ the drying model
│   │   ├── drying.test.ts       # ★ calibrated scenarios
│   │   ├── coefficients.ts      # tunable constants
│   │   └── score.ts             # score → band → headline mapping
│   ├── data/
│   │   ├── openmeteo.ts         # API client + types
│   │   ├── openmeteo.test.ts
│   │   └── citibike.ts          # GBFS feed (v2)
│   ├── storage/
│   │   ├── persistence.ts       # localStorage abstraction
│   │   └── defaults.ts          # seed locations
│   └── calibrate/
│       └── backfit.ts           # v3 — coefficient tuning from ride log
├── tests/
│   └── e2e/                     # playwright (optional, later)
└── docs/
    ├── drying-model.md          # the physics + reasoning
    └── DECISIONS.md             # ADRs for non-obvious choices
```

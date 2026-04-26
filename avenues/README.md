# avenues

NYC bicycle conditions, hyperlocal.

A personal cycling instrument panel. Tells you whether the streets are wet,
whether they'll dry before your commute, and whether you should bike or take
the train. Built for one cyclist's actual commute, then opened up.

Live: [avenues.bike](https://avenues.bike) <!-- update once deployed -->

## What it does

Pulls hourly weather from Open-Meteo, runs a drying model that estimates
whether NYC asphalt is currently wet, and projects forward into your
upcoming commute windows. Painted bike lanes get a separate (slower) drying
estimate because paint stays slick after asphalt dries.

Output: a score 0–100 with a plain-English verdict.

- 85+ → send it
- 65–84 → probably fine, ride aware
- 40–64 → not great
- <40 → skip it

## Why it exists

NYC has 12M+ Citi Bike trips a quarter and zero good "should I ride?" tools.
Weather apps tell you about rain. They don't tell you about painted lanes
slick from drizzle three hours ago, or about ice forming on a bridge deck
near freezing, or about puddles that haven't drained on Flushing Ave.

This does.

## Stack

TypeScript + Vite, vanilla DOM, MapLibre GL, Open-Meteo, deployed on Vercel.
No tracking, no analytics, no third-party scripts. localStorage only.

## Local dev

```bash
pnpm install
pnpm dev
```

## Calibration

The drying model is empirical and tuned to NYC. If it's wrong for your
conditions, log a ride and the calibration script can back-fit coefficients.
See `docs/drying-model.md`.

## License

MIT. Copy it, fork it, adapt it for your city.

— Benny ([@benanabeans](https://instagram.com/benanabeans))

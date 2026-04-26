# First Claude Code session — starter prompt

Paste this (or a trimmed version) into your first Claude Code session, after
running `git init` and `cd`-ing into the repo.

---

## The prompt

> Hey Claude. We're starting a new project called `avenues` — an NYC cycling
> conditions tool. Read `CLAUDE.md` first; it has the full context, stack,
> roadmap, and conventions.
>
> There's also `wetcheck-v0.html` in the repo root. That's a working v0
> prototype I built in chat with Claude, with the full drying model and
> instrument-panel UI in vanilla HTML/JS. Don't delete it — keep it as a
> reference and as a fallback I can run while we rebuild the proper version.
> The drying model in that file is the one we want to port (well-tested,
> coefficients tuned) — see `docs/drying-model.md` for the physics writeup.
>
> Today's goal: scaffold the TypeScript project properly. Specifically:
>
> 1. Initialize a Vite + TypeScript project in this folder (don't overwrite
>    `CLAUDE.md`, `README.md`, `LICENSE`, `.gitignore`, `wetcheck-v0.html`,
>    or anything in `docs/`). Use pnpm.
> 2. Configure strict TypeScript with `noUncheckedIndexedAccess`, path
>    alias `@/` → `src/`.
> 3. Set up Vitest with a basic config.
> 4. Port the drying model from `wetcheck-v0.html` into
>    `src/model/drying.ts` — strict types, exported functions, separated
>    coefficients into `src/model/coefficients.ts`. Add `src/model/drying.test.ts`
>    with the six smoke-test scenarios from the v0 file.
> 5. Stop there. We'll do UI in the next session.
>
> Before you start: confirm the plan in your own words and flag anything in
> `CLAUDE.md` that seems wrong or underspecified. I'd rather we adjust the
> plan now than rework things later.

---

## Why this prompt is shaped this way

- **Points CC at `CLAUDE.md` first** — your context lives there, not in
  Slack scrollback.
- **Names the v0 file explicitly** — prevents CC from "helpfully" deleting
  it as redundant.
- **Bounded scope** — "scaffold + port one module + tests, stop." Open-ended
  prompts in CC tend to produce sprawling first commits that are hard to
  review. One-session-one-deliverable is the right cadence.
- **Asks CC to confirm the plan** — catches misreads of CLAUDE.md before
  any code is written. Especially important when the model's defaults
  might fight your stated preferences.
- **Specifies pnpm explicitly** — your other repos use it, keep the muscle
  memory consistent.

## Subsequent sessions (suggested order)

Once the model is ported and tested:

- **Session 2**: Open-Meteo client in `src/data/openmeteo.ts` with proper
  types and tests. Mock the fetch in tests; don't hit the live API in CI.
- **Session 3**: Storage abstraction in `src/storage/persistence.ts`.
  Initially localStorage; behind an interface so swapping to IndexedDB
  later is a one-file change.
- **Session 4**: UI shell — `index.html`, `src/main.ts`, `src/ui/styles.css`
  (port the CSS variables and palette from v0). Just the frame and primary
  verdict block.
- **Session 5**: Location cards, modal, ride log.
- **Session 6**: ForecastStrip + CommuteWindows (these need the projection
  logic from v0).
- **Session 7**: Deploy to Vercel preview, share with yourself, iterate.
- **Session 8+**: PWA, MapLibre map, then the v2 Citi Bike layer.

## A note on letting CC drive

The CLAUDE.md is opinionated about *what* to build. Let CC decide *how* to
build it within those constraints — its choices on file structure, test
patterns, and small abstractions are usually better than mine because it
sees the latest tooling. Push back when something contradicts CLAUDE.md;
don't push back on micro-decisions.

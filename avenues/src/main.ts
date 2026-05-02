/**
 * avenues — bootstrap.
 *
 * Loads persisted locations + ride log, fetches weather for each location,
 * runs the drying model + score, renders everything to `#root`, and wires up
 * event delegation. Refreshes weather every 10 minutes; ticks the clock every
 * 30 seconds.
 */

import { evaluate } from '@/model/drying.ts';
import { score } from '@/model/score.ts';
import { getWeather, type ShapedWeather } from '@/data/openmeteo.ts';
import { buildBackup, downloadBackup, readBackupFile } from '@/storage/backup.ts';
import { createLocalStoragePersistence } from '@/storage/persistence.ts';
import { DEFAULT_LOCATIONS } from '@/storage/defaults.ts';
import type { Location, RideLogEntry, ScoreBand } from '@/storage/types.ts';

import { renderPrimary } from '@/ui/PrimaryVerdict.ts';
import { renderLocations, type LocationCardData } from '@/ui/LocationCard.ts';
import { renderCommuteWindows } from '@/ui/CommuteWindows.ts';
import { renderDataPanel } from '@/ui/DataPanel.ts';
import { renderForecastStrip } from '@/ui/ForecastStrip.ts';
import { renderModeToggle } from '@/ui/ModeToggle.ts';
import { renderRideLog } from '@/ui/RideLog.ts';
import {
  mountRunTracker,
  renderRunTracker,
  tearDownRunTracker,
  type RunSummary,
} from '@/ui/RunTracker.ts';
import { renderLegs } from '@/ui/SegmentCards.ts';
import { DEFAULT_LEGS } from '@/storage/segments.ts';
import type { LoggedRun, Mode } from '@/storage/types.ts';
import {
  closeLocationModal,
  getEditingLocationId,
  openLocationModal,
  readLocationForm,
} from '@/ui/LocationModal.ts';
import { escapeHtml, fmtShortDate, fmtTime } from '@/ui/format.ts';

import './ui/styles.css';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface WeatherSlot {
  readonly weather: ShapedWeather | null;
  readonly error: string | null;
}

interface AppState {
  locations: Location[];
  weatherByLoc: Map<string, WeatherSlot>;
  log: RideLogEntry[];
  mode: Mode;
}

const state: AppState = {
  locations: [],
  weatherByLoc: new Map(),
  log: [],
  mode: 'bike',
};

const persistence = createLocalStoragePersistence();

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const CLOCK_INTERVAL_MS = 30 * 1000;

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

async function loadAll(): Promise<void> {
  let locations = await persistence.getLocations();
  if (!locations || locations.length === 0) {
    locations = [...DEFAULT_LOCATIONS];
    await persistence.setLocations(locations);
  }
  state.locations = locations;
  state.log = await persistence.getLog();
  state.mode = await persistence.getMode();

  state.weatherByLoc = new Map();
  await Promise.all(
    state.locations.map(async (loc) => {
      try {
        const weather = await getWeather(loc.lat, loc.lon);
        state.weatherByLoc.set(loc.id, { weather, error: null });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        state.weatherByLoc.set(loc.id, { weather: null, error: message });
      }
    }),
  );

  render();
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function render(): void {
  const root = document.getElementById('root');
  if (!root) return;

  if (state.locations.length === 0) {
    root.innerHTML = '<div class="loading">No locations yet</div>';
    return;
  }

  const primary =
    state.locations.find((l) => l.role === 'primary') ?? state.locations[0];
  if (!primary) {
    root.innerHTML = '<div class="loading">No locations yet</div>';
    return;
  }

  const primarySlot = state.weatherByLoc.get(primary.id);
  const primaryWeather = primarySlot?.weather ?? null;

  // Build per-location card data once; reused by primary + cards grid.
  const cards: LocationCardData[] = state.locations.map((loc) => {
    const slot = state.weatherByLoc.get(loc.id);
    if (!slot || !slot.weather || slot.weather.history.length === 0) {
      return {
        location: loc,
        state: null,
        score: null,
        ...(slot?.error ? { error: slot.error } : {}),
      };
    }
    const evalState = evaluate(slot.weather.history);
    if (!evalState) {
      return { location: loc, state: null, score: null };
    }
    const apparentTempC = currentApparentTemp(slot.weather);
    const scored = score(evalState, slot.weather.forecast, {
      mode: state.mode,
      ...(apparentTempC != null ? { apparentTempC } : {}),
    });
    return {
      location: loc,
      state: evalState,
      score: scored,
      ...(apparentTempC != null ? { apparentTempC } : {}),
    };
  });

  const primaryCard = cards.find((c) => c.location.id === primary.id);

  // Logo dot color tracks primary band.
  const logoDot = document.getElementById('logoDot');
  if (logoDot && primaryCard?.score) {
    logoDot.style.background = bandToCssVar(primaryCard.score.band);
  }

  if (
    !primaryWeather ||
    primaryWeather.history.length === 0 ||
    !primaryCard?.state ||
    !primaryCard.score
  ) {
    const errMessage = primarySlot?.error ?? 'no weather data';
    root.innerHTML = `
      <div class="error">Could not fetch weather for ${escapeHtml(primary.name)}. ${escapeHtml(errMessage)}</div>
      ${renderLocations(cards, { mode: state.mode })}
    `;
    return;
  }

  const apparentTempC = currentApparentTemp(primaryWeather);
  const isBike = state.mode === 'bike';
  const isRun = state.mode === 'run';

  // Bike-only sections — hidden in run mode where the runner only cares about
  // their current location + the live tracker.
  const locationsHtml = isBike ? renderLocations(cards, { mode: state.mode }) : '';
  const legsHtml = isBike ? renderLegs(state.mode, DEFAULT_LEGS, cards) : '';
  const commuteHtml = isBike
    ? renderCommuteWindows(primary, primaryWeather.history, primaryWeather.forecast, {
        mode: state.mode,
      })
    : '';

  // Run-only — the live tracker (idle / active / done state).
  const trackerHtml = isRun ? renderRunTracker() : '';

  root.innerHTML = `
    ${renderModeToggle(state.mode)}
    ${renderPrimary(primary, primaryCard.state, primaryCard.score, {
      mode: state.mode,
      ...(apparentTempC != null ? { apparentTempC } : {}),
    })}
    ${trackerHtml}
    ${locationsHtml}
    ${legsHtml}
    ${commuteHtml}
    ${renderForecastStrip(primary, primaryWeather.history, primaryWeather.forecast)}
    ${renderRideLog(state.log, state.locations, { mode: state.mode })}
    ${renderDataPanel()}
  `;

  if (isRun) {
    mountRunTracker({
      onSaveRun: handleSaveRun,
      requestRefresh: render,
    });
  }
}

function currentApparentTemp(weather: ShapedWeather): number | undefined {
  const last = weather.history[weather.history.length - 1];
  return last?.apparentTemp;
}

function bandToCssVar(band: ScoreBand): string {
  switch (band) {
    case 'good':
      return 'var(--moss)';
    case 'fair':
      return 'var(--sodium)';
    case 'poor':
      return 'var(--rust)';
    case 'bad':
      return 'var(--oxide)';
  }
}

// ---------------------------------------------------------------------------
// Clock
// ---------------------------------------------------------------------------

function tickClock(): void {
  const now = new Date();
  const clock = document.getElementById('clock');
  const stamp = document.getElementById('dateStamp');
  if (clock) clock.textContent = fmtTime(now);
  if (stamp) stamp.textContent = fmtShortDate(now);
}

// ---------------------------------------------------------------------------
// Event delegation — one click handler at body level
// ---------------------------------------------------------------------------

function setupEventDelegation(): void {
  document.body.addEventListener('click', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLElement)) return;
    const actionEl = target.closest<HTMLElement>('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (!action) return;

    e.stopPropagation();

    switch (action) {
      case 'add-location':
        openLocationModal(null);
        break;
      case 'edit-location': {
        const id = actionEl.dataset.id;
        const loc = id ? state.locations.find((l) => l.id === id) : null;
        if (loc) openLocationModal(loc);
        break;
      }
      case 'make-primary': {
        const id = actionEl.dataset.id;
        if (!id) break;
        state.locations = state.locations.map((l) => ({
          ...l,
          role: l.id === id ? 'primary' : 'secondary',
        }));
        await persistence.setLocations(state.locations);
        render();
        break;
      }
      case 'log-ride':
        await handleLogRide();
        break;
      case 'remove-log': {
        const idx = parseInt(actionEl.dataset.index ?? '', 10);
        if (Number.isNaN(idx)) break;
        state.log = [...state.log.slice(0, idx), ...state.log.slice(idx + 1)];
        await persistence.setLog(state.log);
        render();
        break;
      }
      case 'export-data': {
        downloadBackup(buildBackup(state.locations, state.log));
        break;
      }
      case 'import-data': {
        const fileInput = document.getElementById('importFile');
        if (fileInput instanceof HTMLInputElement) fileInput.click();
        break;
      }
      case 'set-mode': {
        const m = actionEl.dataset.mode;
        if (m !== 'bike' && m !== 'run') break;
        if (state.mode === m) break;
        // Leaving run mode: stop the live tracker (keeps the snapshot so the
        // user can save it on return). Doesn't auto-discard.
        if (state.mode === 'run' && m === 'bike') tearDownRunTracker();
        state.mode = m;
        await persistence.setMode(m);
        render();
        break;
      }
      case 'reset-defaults': {
        const ok = confirm(
          'Replace your saved locations with the seeded generic defaults (HOME, OFFICE, GYM, FDR)?\n\nThis does not touch your ride log.',
        );
        if (!ok) break;
        state.locations = [...DEFAULT_LOCATIONS];
        await persistence.setLocations(state.locations);
        await loadAll();
        break;
      }
    }
  });

  // File input change → import the chosen backup.
  document.body.addEventListener('change', async (e) => {
    const target = e.target;
    if (!(target instanceof HTMLInputElement) || target.id !== 'importFile') return;
    const file = target.files?.[0];
    if (!file) return;
    try {
      const payload = await readBackupFile(file);
      const ok = confirm(
        `Import ${payload.locations.length} locations and ${payload.log.length} log entries? This replaces what's currently saved.`,
      );
      if (!ok) {
        target.value = '';
        return;
      }
      state.locations = [...payload.locations];
      state.log = [...payload.log];
      await persistence.setLocations(state.locations);
      await persistence.setLog(state.log);
      target.value = '';
      await loadAll();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`Import failed: ${message}`);
      target.value = '';
    }
  });
}

async function handleLogRide(): Promise<void> {
  const locSelect = document.getElementById('logLoc') as HTMLSelectElement | null;
  const noteInput = document.getElementById('logNote') as HTMLInputElement | null;
  if (!locSelect || !noteInput) return;

  const locId = locSelect.value;
  const loc = state.locations.find((l) => l.id === locId);
  if (!loc) return;

  const slot = state.weatherByLoc.get(locId);
  if (!slot?.weather || slot.weather.history.length === 0) return;

  const evalState = evaluate(slot.weather.history);
  if (!evalState) return;

  const apparentTempC = currentApparentTemp(slot.weather);
  const scored = score(evalState, slot.weather.forecast, {
    mode: state.mode,
    ...(apparentTempC != null ? { apparentTempC } : {}),
  });
  const entry: RideLogEntry = {
    ts: Date.now(),
    locId,
    locName: loc.name,
    note: noteInput.value.trim(),
    score: scored.score,
    band: scored.band,
    mode: state.mode,
    conditions: {
      temp: evalState.currentTemp,
      wind: evalState.currentWind,
      humid: evalState.currentHumid,
      rainNow: evalState.rainNow,
      wet: evalState.wet,
    },
  };

  state.log = [entry, ...state.log];
  await persistence.setLog(state.log);
  noteInput.value = '';
  render();
}

/**
 * Persist a tracker-recorded run as a log entry. Uses the primary location
 * for current weather/score snapshot — the tracker doesn't ask which location
 * the run started from (that'd be friction; the runner's GPS is already known
 * by the tracker, the primary is the closest sensible attribution).
 */
async function handleSaveRun(summary: RunSummary): Promise<void> {
  const primary =
    state.locations.find((l) => l.role === 'primary') ?? state.locations[0];
  if (!primary) return;

  const slot = state.weatherByLoc.get(primary.id);
  if (!slot?.weather || slot.weather.history.length === 0) return;

  const evalState = evaluate(slot.weather.history);
  if (!evalState) return;

  const apparentTempC = currentApparentTemp(slot.weather);
  const scored = score(evalState, slot.weather.forecast, {
    mode: 'run',
    ...(apparentTempC != null ? { apparentTempC } : {}),
  });

  const loggedRun: LoggedRun = {
    distance_m: summary.distance_m,
    duration_ms: summary.duration_ms,
    splits: summary.splits.map((s) => ({
      mile: s.mile,
      splitMs: s.splitMs,
      totalMs: s.totalMs,
    })),
  };

  const entry: RideLogEntry = {
    ts: Date.now(),
    locId: primary.id,
    locName: primary.name,
    note: '',
    score: scored.score,
    band: scored.band,
    mode: 'run',
    conditions: {
      temp: evalState.currentTemp,
      wind: evalState.currentWind,
      humid: evalState.currentHumid,
      rainNow: evalState.rainNow,
      wet: evalState.wet,
    },
    run: loggedRun,
  };

  state.log = [entry, ...state.log];
  await persistence.setLog(state.log);
  render();
}

// ---------------------------------------------------------------------------
// Modal handlers (the modal is a static DOM fragment in index.html)
// ---------------------------------------------------------------------------

function setupModalHandlers(): void {
  const cancelBtn = document.getElementById('modalCancel');
  const saveBtn = document.getElementById('modalSave');
  const deleteBtn = document.getElementById('modalDelete');
  const useGeoBtn = document.getElementById('useGeo');
  const modal = document.getElementById('locModal');

  cancelBtn?.addEventListener('click', closeLocationModal);

  modal?.addEventListener('click', (e) => {
    if (e.target instanceof HTMLElement && e.target.id === 'locModal') {
      closeLocationModal();
    }
  });

  useGeoBtn?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      alert('Geolocation not available');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const latInput = document.getElementById('locLat') as HTMLInputElement | null;
        const lonInput = document.getElementById('locLon') as HTMLInputElement | null;
        if (latInput) latInput.value = p.coords.latitude.toFixed(4);
        if (lonInput) lonInput.value = p.coords.longitude.toFixed(4);
      },
      (err) => alert(`Geolocation failed: ${err.message}`),
    );
  });

  saveBtn?.addEventListener('click', async () => {
    const form = readLocationForm();
    if (!form) {
      alert('Please fill all fields');
      return;
    }
    const editingId = getEditingLocationId();

    let next: Location[];
    if (editingId) {
      next = state.locations.map((l) =>
        l.id === editingId
          ? { ...l, name: form.name, lat: form.lat, lon: form.lon, role: form.role }
          : l,
      );
    } else {
      next = [
        ...state.locations,
        {
          id: form.id,
          name: form.name,
          lat: form.lat,
          lon: form.lon,
          role: form.role,
        },
      ];
    }

    // Enforce a single primary location.
    if (form.role === 'primary') {
      const winnerId = editingId ?? form.id;
      next = next.map((l) => ({
        ...l,
        role: l.id === winnerId ? 'primary' : 'secondary',
      }));
    }

    state.locations = next;
    await persistence.setLocations(state.locations);
    closeLocationModal();
    await loadAll();
  });

  deleteBtn?.addEventListener('click', async () => {
    const editingId = getEditingLocationId();
    if (!editingId) return;
    if (!confirm('Delete this location?')) return;

    state.locations = state.locations.filter((l) => l.id !== editingId);
    if (state.locations.length > 0 && !state.locations.some((l) => l.role === 'primary')) {
      const first = state.locations[0];
      if (first) {
        state.locations = [{ ...first, role: 'primary' }, ...state.locations.slice(1)];
      }
    }
    await persistence.setLocations(state.locations);
    closeLocationModal();
    await loadAll();
  });
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------

tickClock();
setInterval(tickClock, CLOCK_INTERVAL_MS);
setupEventDelegation();
setupModalHandlers();
void loadAll();
setInterval(() => void loadAll(), REFRESH_INTERVAL_MS);

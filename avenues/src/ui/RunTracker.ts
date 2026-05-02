/**
 * Run tracker UI — three states (idle / active / done), driven by a singleton
 * RunTracker instance held in module scope so it survives parent re-renders.
 *
 * The parent app re-renders innerHTML on weather refresh (every 10 min). That
 * would normally tear down the live tick display + button handlers, so this
 * module exposes:
 *   - {@link renderRunTracker}: HTML for current state
 *   - {@link mountRunTracker}: re-binds DOM listeners + restarts the live tick
 *
 * The expensive bits (geolocation watch, wake lock, the tracker state) live
 * in module-level singletons and are never disturbed by re-renders.
 */

import { startGeoWatch, type GeoWatch } from '@/run/geo.ts';
import { fmtClock, fmtMiles, fmtPace, speechForSplit } from '@/run/format.ts';
import { cancelAllSpeech, prime as primeSpeech, speak } from '@/run/speech.ts';
import { RunTracker, type Split, type TrackerSnapshot } from '@/run/tracker.ts';
import { acquireWakeLock, type WakeLockHandle } from '@/run/wakeLock.ts';

import { escapeHtml } from './format.ts';

// ---------------------------------------------------------------------------
// Public summary type — handed back to main.ts when the user taps SAVE.
// ---------------------------------------------------------------------------

export interface RunSummary {
  readonly distance_m: number;
  readonly duration_ms: number;
  readonly splits: readonly Split[];
}

export interface RunTrackerCallbacks {
  /** User confirmed save after stopping. Caller persists to the ride log. */
  onSaveRun(summary: RunSummary): void;
  /** Ask the parent to re-render (e.g. after state transition idle↔active↔done). */
  requestRefresh(): void;
}

// ---------------------------------------------------------------------------
// Singleton state
// ---------------------------------------------------------------------------

let tracker: RunTracker | null = null;
let geoWatch: GeoWatch | null = null;
let wakeLock: WakeLockHandle | null = null;
let tickHandle: ReturnType<typeof setInterval> | null = null;
let geoErrorMessage: string | null = null;
/** When stopped, hold the final snapshot so the Done view renders consistently. */
let finalSnapshot: TrackerSnapshot | null = null;
/** Has the user dismissed the post-run summary back to idle? */
let dismissed = true;

// ---------------------------------------------------------------------------
// Public — renders + mounts
// ---------------------------------------------------------------------------

export function renderRunTracker(): string {
  if (tracker == null || dismissed) {
    return idleHtml();
  }
  const snap = tracker.snapshot();
  if (snap.running) {
    return activeHtml(snap);
  }
  return doneHtml(finalSnapshot ?? snap);
}

export function mountRunTracker(callbacks: RunTrackerCallbacks): void {
  // Wire button handlers — re-bound on every parent re-render.
  byId('runStartBtn')?.addEventListener('click', () => handleStart(callbacks));
  byId('runStopBtn')?.addEventListener('click', () => handleStop(callbacks));
  byId('runSaveBtn')?.addEventListener('click', () => handleSave(callbacks));
  byId('runDiscardBtn')?.addEventListener('click', () => handleDiscard(callbacks));

  // Restart the live tick when the section was just rendered into Active state.
  if (tracker?.snapshot().running) {
    startTick();
  } else {
    stopTick();
  }
}

/**
 * Called when leaving run mode. Stops geo, releases wake lock, clears tick.
 * Does NOT auto-save the in-flight run — explicit user action required.
 */
export function tearDownRunTracker(): void {
  stopTick();
  geoWatch?.stop();
  geoWatch = null;
  void wakeLock?.release();
  wakeLock = null;
  cancelAllSpeech();
  // Leave `tracker` + `finalSnapshot` intact so the user can save on return.
}

// ---------------------------------------------------------------------------
// State transitions
// ---------------------------------------------------------------------------

function handleStart(callbacks: RunTrackerCallbacks): void {
  // Prime SpeechSynthesis inside this user gesture — required on iOS Safari.
  primeSpeech();

  tracker = new RunTracker();
  tracker.start(Date.now());
  finalSnapshot = null;
  dismissed = false;
  geoErrorMessage = null;

  void acquireWakeLock().then((handle) => {
    wakeLock = handle;
  });

  geoWatch = startGeoWatch({
    onFix(fix) {
      if (!tracker) return;
      const result = tracker.ingest(fix);
      // Speak each newly-crossed split. Usually just one; the loop keeps us
      // safe if a single fix lands far past a boundary.
      for (const split of result.newSplits) {
        speak(speechForSplit(split));
      }
    },
    onError(err) {
      geoErrorMessage = err.message || 'Could not get GPS signal.';
      callbacks.requestRefresh();
    },
  });

  callbacks.requestRefresh();
}

function handleStop(callbacks: RunTrackerCallbacks): void {
  if (!tracker) return;
  finalSnapshot = tracker.stop(Date.now());
  geoWatch?.stop();
  geoWatch = null;
  void wakeLock?.release();
  wakeLock = null;
  stopTick();
  cancelAllSpeech();
  callbacks.requestRefresh();
}

function handleSave(callbacks: RunTrackerCallbacks): void {
  if (!finalSnapshot) return;
  callbacks.onSaveRun({
    distance_m: finalSnapshot.distance_m,
    duration_ms: finalSnapshot.duration_ms,
    splits: finalSnapshot.splits,
  });
  reset();
  callbacks.requestRefresh();
}

function handleDiscard(callbacks: RunTrackerCallbacks): void {
  reset();
  callbacks.requestRefresh();
}

function reset(): void {
  tracker = null;
  finalSnapshot = null;
  dismissed = true;
  geoErrorMessage = null;
}

// ---------------------------------------------------------------------------
// Live tick — updates distance/time/pace text in place every second
// ---------------------------------------------------------------------------

function startTick(): void {
  stopTick();
  // 1 Hz is enough — the time field has 1-second resolution anyway.
  tickHandle = setInterval(() => {
    if (!tracker) return;
    const snap = tracker.snapshot();
    setText('runDist', fmtMiles(snap.distance_m));
    setText('runTime', fmtClock(snap.duration_ms));
    setText('runPace', fmtPace(snap.distance_m, snap.duration_ms));
  }, 1000);
}

function stopTick(): void {
  if (tickHandle != null) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

// ---------------------------------------------------------------------------
// HTML
// ---------------------------------------------------------------------------

function idleHtml(): string {
  return `
    <div class="section-head">
      <div class="section-title">RUN TRACKER</div>
      <div class="section-sub">live distance · audible mile splits via your speaker</div>
    </div>
    <div class="run-card run-idle">
      <div class="run-explainer">
        Tap START to begin tracking. The app will use your phone GPS, keep the
        screen awake, and speak each mile split aloud through your speaker.
        Foreground only — keep this tab visible.
      </div>
      <button class="btn primary run-big-btn" id="runStartBtn" data-action="run-start">START RUN</button>
    </div>
  `;
}

function activeHtml(snap: TrackerSnapshot): string {
  const errLine =
    geoErrorMessage != null
      ? `<div class="run-error">⚠ ${escapeHtml(geoErrorMessage)}</div>`
      : '';
  const splitsList =
    snap.splits.length === 0
      ? '<div class="run-splits-empty">no splits yet — first one fires at mile 1</div>'
      : `<ol class="run-splits">${snap.splits
          .slice()
          .reverse()
          .map(
            (s) => `<li><span class="run-split-mi">MI ${s.mile}</span><span class="run-split-time">${escapeHtml(fmtClock(s.splitMs))}</span></li>`,
          )
          .join('')}</ol>`;
  return `
    <div class="section-head">
      <div class="section-title">RUN TRACKER · LIVE</div>
      <div class="section-sub">screen will stay awake · splits speak at each mile</div>
    </div>
    <div class="run-card run-active">
      ${errLine}
      <div class="run-stats">
        <div class="run-stat">
          <div class="run-stat-label">DIST</div>
          <div class="run-stat-value" id="runDist">${escapeHtml(fmtMiles(snap.distance_m))}</div>
        </div>
        <div class="run-stat">
          <div class="run-stat-label">TIME</div>
          <div class="run-stat-value" id="runTime">${escapeHtml(fmtClock(snap.duration_ms))}</div>
        </div>
        <div class="run-stat">
          <div class="run-stat-label">PACE</div>
          <div class="run-stat-value" id="runPace">${escapeHtml(fmtPace(snap.distance_m, snap.duration_ms))}</div>
        </div>
      </div>
      ${splitsList}
      <button class="btn danger run-big-btn" id="runStopBtn" data-action="run-stop">STOP RUN</button>
    </div>
  `;
}

function doneHtml(snap: TrackerSnapshot): string {
  const splitsList =
    snap.splits.length === 0
      ? '<div class="run-splits-empty">no full miles completed</div>'
      : `<ol class="run-splits">${snap.splits
          .map(
            (s) => `<li><span class="run-split-mi">MI ${s.mile}</span><span class="run-split-time">${escapeHtml(fmtClock(s.splitMs))}</span></li>`,
          )
          .join('')}</ol>`;
  return `
    <div class="section-head">
      <div class="section-title">RUN COMPLETE</div>
      <div class="section-sub">save to log or discard</div>
    </div>
    <div class="run-card run-done">
      <div class="run-stats">
        <div class="run-stat">
          <div class="run-stat-label">DIST</div>
          <div class="run-stat-value">${escapeHtml(fmtMiles(snap.distance_m))}</div>
        </div>
        <div class="run-stat">
          <div class="run-stat-label">TIME</div>
          <div class="run-stat-value">${escapeHtml(fmtClock(snap.duration_ms))}</div>
        </div>
        <div class="run-stat">
          <div class="run-stat-label">PACE</div>
          <div class="run-stat-value">${escapeHtml(fmtPace(snap.distance_m, snap.duration_ms))}</div>
        </div>
      </div>
      ${splitsList}
      <div class="run-done-actions">
        <button class="btn" id="runDiscardBtn" data-action="run-discard">DISCARD</button>
        <button class="btn primary" id="runSaveBtn" data-action="run-save">SAVE TO LOG</button>
      </div>
    </div>
  `;
}

function byId<T extends HTMLElement = HTMLElement>(id: string): T | null {
  const el = document.getElementById(id);
  return el ? (el as T) : null;
}

function setText(id: string, value: string): void {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

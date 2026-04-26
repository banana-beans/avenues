/**
 * End-to-end-ish smoke: drive a synthetic Open-Meteo payload through
 * shapeHourly → evaluate → score → render, asserting the rendered HTML
 * has the structural anchors the CSS hangs off.
 *
 * Catches import-graph bugs, template typos, and obvious logic regressions
 * without spinning up a browser.
 */

import { describe, expect, it } from 'vitest';

import { shapeHourly, type OpenMeteoResponse } from '@/data/openmeteo.ts';
import { evaluate } from '@/model/drying.ts';
import { score } from '@/model/score.ts';
import type { Location, RideLogEntry } from '@/storage/types.ts';

import { renderCommuteWindows } from './CommuteWindows.ts';
import { renderForecastStrip } from './ForecastStrip.ts';
import { renderLocations } from './LocationCard.ts';
import { renderPrimary } from './PrimaryVerdict.ts';
import { renderRideLog } from './RideLog.ts';
import { renderBikeLegs } from './SegmentCards.ts';
import { DEFAULT_BIKE_LEGS } from '@/storage/segments.ts';

function localISO(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T${hh}:00`;
}

const NOW = new Date('2026-04-26T12:00:00');
const LOC: Location = {
  id: 'home',
  name: 'HOME',
  lat: 40.6262,
  lon: -74.0327,
  role: 'primary',
};

function fixturePayload(): OpenMeteoResponse {
  const time: string[] = [];
  for (let i = -23; i <= 24; i++) {
    time.push(localISO(new Date(NOW.getTime() + i * 3_600_000)));
  }
  const length = time.length;
  const filled = (v: number): number[] => Array.from({ length }, () => v);
  return {
    hourly: {
      time,
      temperature_2m: filled(15),
      relative_humidity_2m: filled(60),
      precipitation: filled(0),
      rain: filled(0),
      cloud_cover: filled(40),
      wind_speed_10m: filled(8),
      is_day: filled(1),
      precipitation_probability: filled(5),
    },
  };
}

describe('end-to-end UI render', () => {
  it('renders a primary verdict block with all telemetry cells', () => {
    const shape = shapeHourly(fixturePayload(), NOW);
    const evalState = evaluate(shape.history)!;
    const scored = score(evalState, shape.forecast);

    const html = renderPrimary(LOC, evalState, scored, { mode: 'bike' });

    expect(html).toContain('class="primary"');
    expect(html).toContain('class="score-block"');
    expect(html).toContain('class="verdict-block"');
    expect(html).toContain('class="telemetry"');
    expect(html).toContain('TEMP');
    expect(html).toContain('SURFACE');
    expect(html).toContain('SINCE RAIN');
    expect(html).toContain(`${scored.score}`);
    expect(html).toContain(scored.band); // "good"|"fair"|"poor"|"bad"
    expect(html).toContain('HOME');
  });

  it('renders the locations grid with primary marker and add button', () => {
    const shape = shapeHourly(fixturePayload(), NOW);
    const evalState = evaluate(shape.history)!;
    const scored = score(evalState, shape.forecast);

    const html = renderLocations([
      { location: LOC, state: evalState, score: scored },
      {
        location: { ...LOC, id: 'office', name: 'OFFICE', role: 'secondary' },
        state: null,
        score: null,
        error: 'HTTP 503',
      },
    ]);

    expect(html).toContain('LOCATIONS');
    expect(html).toContain('HOME ★');
    expect(html).toContain('OFFICE');
    expect(html).toContain('HTTP 503');
    expect(html).toContain('data-action="add-location"');
    expect(html).toContain('data-action="edit-location"');
  });

  it('renders commute windows when scheduled and weather is available', () => {
    const earlyMorning = new Date('2026-04-26T05:00:00');
    const shape = shapeHourly(fixturePayload(), earlyMorning);
    const html = renderCommuteWindows(LOC, shape.history, shape.forecast, earlyMorning);
    expect(html).toContain('COMMUTE WINDOWS');
    expect(html).toContain('TODAY · MORNING');
  });

  it('renders the 18-hour forecast strip with NOW marker', () => {
    const shape = shapeHourly(fixturePayload(), NOW);
    const html = renderForecastStrip(LOC, shape.history, shape.forecast);
    expect(html).toContain('18-HOUR FORECAST');
    expect(html).toContain('class="fhour now"');
  });

  it('renders the empty ride log + add controls when no rides logged', () => {
    const html = renderRideLog([], [LOC]);
    expect(html).toContain('RIDE LOG');
    expect(html).toContain('No rides logged yet');
    expect(html).toContain('data-action="log-ride"');
  });

  it('renders ride log rows with stored band class', () => {
    const entry: RideLogEntry = {
      ts: NOW.getTime(),
      locId: LOC.id,
      locName: LOC.name,
      note: 'Brooklyn Bridge loop',
      score: 87,
      band: 'good',
      conditions: { temp: 18, wind: 10, humid: 50, rainNow: false, wet: false },
    };
    const html = renderRideLog([entry], [LOC]);
    expect(html).toContain('Brooklyn Bridge loop');
    expect(html).toContain('class="score-mini good"');
    expect(html).toContain('data-action="remove-log"');
  });

  it('renders bike-leg cards picking the worse endpoint as the leg score', () => {
    const homeLoc: Location = { id: 'home', name: 'HOME', lat: 40.6, lon: -74, role: 'primary' };
    const ferryLoc: Location = {
      id: 'ferry-si',
      name: 'ST. GEORGE',
      lat: 40.6437,
      lon: -74.0726,
      role: 'secondary',
    };
    const cards = [
      {
        location: homeLoc,
        state: { wet: false } as any,
        score: { score: 92, band: 'good', headline: 'Send it.', body: '', reasons: [], sweetSpot: false } as any,
      },
      {
        location: ferryLoc,
        state: { wet: true } as any,
        score: { score: 70, band: 'fair', headline: 'Probably fine.', body: '', reasons: [], sweetSpot: false } as any,
      },
    ];
    const html = renderBikeLegs(
      [{ id: 'home-stgeorge', fromId: 'home', toId: 'ferry-si', label: 'HOME ↔ ST. GEORGE' }],
      cards,
    );
    expect(html).toContain('BIKE LEGS');
    expect(html).toContain('HOME ↔ ST. GEORGE');
    expect(html).toContain('70'); // worse endpoint wins
    expect(html).toContain('class="leg-score fair"');
    expect(html).toContain('weakest: ST. GEORGE');
  });

  it('renders zero leg cards when no scored endpoints exist', () => {
    const html = renderBikeLegs(DEFAULT_BIKE_LEGS, []);
    expect(html).toBe('');
  });

  it('escapes user-supplied strings to prevent XSS in the ride log', () => {
    const evil = '<img src=x onerror=alert(1)>';
    const entry: RideLogEntry = {
      ts: NOW.getTime(),
      locId: LOC.id,
      locName: LOC.name,
      note: evil,
      score: 80,
      band: 'fair',
      conditions: { temp: 18, wind: 10, humid: 50, rainNow: false, wet: false },
    };
    const html = renderRideLog([entry], [LOC]);
    expect(html).not.toContain(evil);
    expect(html).toContain('&lt;img');
  });
});

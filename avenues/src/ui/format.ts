/**
 * Tiny formatters shared across UI components.
 *
 * No DOM imports here; these are pure string helpers so they can be unit
 * tested without jsdom and reused on a server one day if we add a backend.
 */

import type { ScoreBand } from '@/storage/types.ts';

/** Escape user-supplied strings for safe interpolation into HTML. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return c;
    }
  });
}

/** Format a clock time in 24h, locale-respecting. */
export function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/** Format a short date (used in ride log + footer). */
export function fmtShortDate(d: Date): string {
  return d
    .toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
    .toUpperCase();
}

/** Format a short date+time for the ride log. */
export function fmtLogStamp(d: Date): string {
  return d.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Map a 0-100 score to a band class. */
export function bandFromScore(score: number): ScoreBand {
  if (score >= 85) return 'good';
  if (score >= 65) return 'fair';
  if (score >= 40) return 'poor';
  return 'bad';
}

/** Generate a stable opaque ID for a new location. */
export function makeLocationId(): string {
  return `loc_${Date.now().toString(36)}`;
}

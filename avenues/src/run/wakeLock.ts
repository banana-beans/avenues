/**
 * Screen Wake Lock wrapper.
 *
 * Without this, the phone screen sleeps after ~30s and the JS event loop is
 * throttled — geolocation callbacks stall and split announcements never fire.
 *
 * Wake Lock is automatically released when the page loses visibility (tab
 * switch, app backgrounded). We re-acquire on `visibilitychange → visible`
 * so that briefly checking another app doesn't kill the run.
 *
 * Returns `null` on browsers without the API (older iOS Safari, Firefox <
 * 126). Caller should treat this as "screen may sleep mid-run" and warn.
 */

export interface WakeLockHandle {
  release(): Promise<void>;
}

export async function acquireWakeLock(): Promise<WakeLockHandle | null> {
  if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return null;

  let sentinel: WakeLockSentinel | null = null;
  let released = false;

  async function take(): Promise<void> {
    try {
      sentinel = await navigator.wakeLock.request('screen');
    } catch {
      sentinel = null;
    }
  }

  await take();

  // Re-acquire after coming back from a background → foreground transition.
  const visibilityHandler = (): void => {
    if (released) return;
    if (
      document.visibilityState === 'visible' &&
      (sentinel == null || sentinel.released)
    ) {
      void take();
    }
  };
  document.addEventListener('visibilitychange', visibilityHandler);

  return {
    async release() {
      released = true;
      document.removeEventListener('visibilitychange', visibilityHandler);
      if (sentinel && !sentinel.released) {
        try {
          await sentinel.release();
        } catch {
          // Best-effort: browser may have already revoked it.
        }
      }
      sentinel = null;
    },
  };
}

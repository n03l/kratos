// Keep the screen on while the app is visible (Screen Wake Lock API). The browser releases the lock whenever
// the page is hidden, so it is requested again each time the app comes back to the foreground.

export const wake = $state({
  /** The API exists and the page is a secure context (HTTPS or localhost). */
  supported: typeof navigator !== 'undefined' && 'wakeLock' in navigator && isSecureContext,
  active: false,
  error: '',
});

let wanted = false;
let sentinel: WakeLockSentinel | null = null;
let pending: Promise<void> | null = null;

async function acquire() {
  if (!wanted || !wake.supported || sentinel || document.visibilityState !== 'visible') return;
  pending ??= (async () => {
    try {
      const s = await navigator.wakeLock.request('screen');
      s.addEventListener('release', () => {
        if (sentinel === s) sentinel = null;
        wake.active = false;
      });
      sentinel = s;
      wake.active = true;
      wake.error = '';
      // Turned off while the request was in flight.
      if (!wanted) await release();
    } catch (err) {
      wake.error = `The browser refused to keep the screen on (${(err as Error).message}). It may be in battery saver mode.`;
    } finally {
      pending = null;
    }
  })();
  await pending;
}

async function release() {
  const s = sentinel;
  sentinel = null;
  wake.active = false;
  await s?.release().catch(() => {});
}

/** Turn keeping the screen on on or off. Safe to call repeatedly. */
export function keepScreenOn(on: boolean) {
  wanted = on;
  void (on ? acquire() : release());
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void acquire();
  });
}

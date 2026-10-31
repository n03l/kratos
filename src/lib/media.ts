// The rest timer in the phone's media notification. Chrome on Android shows one while the page plays audio,
// which it does during a rest (the countdown keep-alive, see sound.ts). Without this it only says the app is
// running; with it the notification shows the next set, the time left, and buttons to adjust or skip the rest.

export interface RestMedia {
  /** First line, e.g. "Next: Squat (barbell)". */
  title: string;
  /** Second line, e.g. "112.5 kg × 5". */
  detail: string;
  endsAt: number;
  totalSec: number;
}

export interface RestActions {
  more: () => void;
  less: () => void;
  skip: () => void;
}

const session = () => ('mediaSession' in navigator ? navigator.mediaSession : null);

let handlersSet = false;

function setHandlers(ms: MediaSession, a: RestActions) {
  const handlers: [MediaSessionAction, MediaSessionActionHandler][] = [
    ['seekforward', () => a.more()],
    ['seekbackward', () => a.less()],
    ['nexttrack', () => a.skip()],
    // Pause would stop the page's audio and with it the beeps; the rest keeps running instead.
    ['pause', () => undefined],
    ['play', () => undefined],
  ];
  for (const [action, fn] of handlers) {
    try {
      ms.setActionHandler(action, fn);
    } catch {
      // Not every browser knows every action.
    }
  }
}

/** Show a rest in the media notification, or clear it with null. */
export function showRest(rest: RestMedia | null, actions: RestActions) {
  const ms = session();
  if (!ms) return;
  try {
    if (!rest) {
      ms.metadata = null;
      ms.playbackState = 'none';
      return;
    }
    if (!handlersSet) {
      setHandlers(ms, actions);
      handlersSet = true;
    }
    const icon = (n: number) => ({ src: `${import.meta.env.BASE_URL}icon-${n}.png`, sizes: `${n}x${n}`, type: 'image/png' });
    ms.metadata = new MediaMetadata({ title: rest.title, artist: rest.detail, album: 'Kratos', artwork: [icon(192), icon(512)] });
    ms.playbackState = 'playing';
    const left = Math.max(0, (rest.endsAt - Date.now()) / 1000);
    const duration = Math.max(rest.totalSec, left, 1);
    ms.setPositionState?.({ duration, position: Math.min(duration, duration - left), playbackRate: 1 });
  } catch {
    // The notification is a convenience; the timer works without it.
  }
}

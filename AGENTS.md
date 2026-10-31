# AGENTS.md

Guide for coding agents working on Kratos, a workout-tracker PWA (Svelte 5 + Vite + TypeScript, static hosting
on GitHub Pages or Vercel). Read `README.md` for what the app does.

## Commands

```sh
npm install
npm run dev        # dev server on 127.0.0.1:5173; DEV_HOST=<lan-ip> npm run dev to reach it from a phone
npm test           # Vitest unit tests (src/**/*.test.ts)
npm run check      # svelte-check + TypeScript; must report 0 errors and 0 warnings
npm run build      # static build in dist/ with service worker; BASE_PATH=/kratos/ for a Pages subpath
npm run preview    # serve dist/ on 127.0.0.1:4173 (secure context, so location and wake lock work)
                   # Drive sync needs GOOGLE_CLIENT_ID at build time; test it with stubbed Google routes
```

Before finishing a change, run `npm run check`, `npm test` and `npm run build`. For UI changes, also drive the app
in a headless browser (below).

`README.md` is for people using the app: describe features there in plain language when they change, and keep
developer details here.

## Running and deploying

- To try it on a phone on the same network: `DEV_HOST=<LAN IP> npm run dev`. Over plain HTTP on a LAN address the
  app works, but the browser won't install it or run the service worker (that needs HTTPS or localhost).
- Static hosting only. Routing uses the URL hash, so Pages and Vercel need no rewrites. For GitHub Pages under a
  subpath, build with `BASE_PATH=/kratos/ npm run build`.

### Google Drive sync setup

Sync runs entirely in the browser (Google Identity Services and the Drive API, scope `drive.file`, so Kratos sees
only the file it created). It needs an HTTPS origin or localhost.

1. In Google Cloud Console, create a project and enable the **Google Drive API**.
2. OAuth consent screen: External, in Testing, with your Google account as a test user; scope `drive.file`.
3. Credentials > Create OAuth client ID > Web application. Authorized JavaScript origins: the production URL
   (e.g. `https://<project>.vercel.app`), `http://localhost:5173`, `http://localhost:4173`.
4. For local builds put the client id in `.env.local` (see `.env.example`). On Vercel, set the environment
   variable `GOOGLE_CLIENT_ID` and redeploy: it is read at build time.

The client id is public, not a secret. Builds without it hide Drive sync.

## Layout

- `src/lib/model.ts`: domain types. Weights are kilograms.
- `src/lib/logic/`: pure functions with unit tests (training math, rest rules, records). Put new rules here and
  test them; keep components thin.
- `src/lib/store.svelte.ts`: the only place that changes app state. Autosaves to the repo.
- `src/lib/repo/`: `Repo` interface, IndexedDB implementation, backup validation, starter and sample data.
- `src/lib/sync/drive.ts`: Google sign-in and Drive API calls; `src/lib/logic/sync.ts` decides what to sync.
- `src/routes/`: one component per screen, chosen by the hash router in `src/App.svelte`.
- `src/lib/components/`: shared UI (bottom sheets, set rows, set editor, rest timer, charts, logo).
- `src/lib/sound.ts`: countdown beeps; `src/lib/media.ts`: the rest in the media notification (see Rest timer
  and sound).
- `tools/`: scripts that run outside the app (FitNotes conversion).
- `docs/screenshots/`: the README screenshots.

## Conventions

- Svelte 5 runes (`$state`, `$derived`, `$props`). Don't mutate props from a child component. Components call
  store functions (e.g. `updateSet`, `toggleDone`), which mutate state. `bind:value` on a property of a prop
  object does not reach the store; use an event handler that calls the store.
- Saving is automatic (debounced effect in the store). Don't add explicit save calls.
- Keep objects that are only read (e.g. a parsed file) in `$state.raw`: `structuredClone` can't copy the
  proxies `$state` makes, and `planMerge` clones its inputs.
- Component class names must not reuse the global utilities in `app.css` (`.btn`, `.block`, `.chip`, `.stack`…):
  a scoped `.block` rule also hits every `btn block` button in that component.
- Changing the stored data shape: bump `SNAPSHOT_VERSION` in `model.ts`, accept the old shape in
  `repo/validate.ts` (it also normalises data loaded from IndexedDB), and extend `validate.test.ts`.
- Anything typed into a form, imported or added by a store function must stay within the limits `validate.ts`
  checks (`LIMITS` for list sizes), or the next start finds the data unreadable and stops saving. Use `NumberField` for numbers, `clampNumber`/`cleanText` (`logic/limits.ts`) in
  store functions, and never `bind:value` straight onto stored data. As a last line, `saveNow` refuses to write
  data that wouldn't load (everything but saved workouts, which only change through store functions) and the
  draft is checked with `parseDraft` before it is saved, and a finished workout with `parseSession`.
- `validate.ts` normalises rather than rejects what older or hand-edited data may contain: `startedAt` becomes ISO
  text (workouts are sorted by comparing it, see `newestFirst`), repeated block and set ids get fresh ones (they
  are keys on screen), and a gym without plates gets the usual ones. Keyed `{#each}` blocks need keys that are
  unique even in odd data: an exercise can appear twice in one workout.
- Match the surrounding code: small functions, comments only where intent isn't obvious, sentence-case UI copy,
  active verbs on buttons ("Save rest", not "Submit"), errors that say what happened and what to do.

## Sets

`LoggedSet.weight` is the load in kg; for `equipment: 'bodyweight'` it is *added* weight (0 = bodyweight only).
Exercises with `measure: 'time'` log `durationSec` with `reps` 0, use `TimedScheme` (secMin/secMax) and progress
5 s at a time (`suggestNext`). Drop sets (`type: 'drop'`) are planned from `StraightScheme.drops`/`dropPct`
with `dropWeight` and don't count towards progression. Myo-reps were removed (snapshot 6): `validate.ts` turns
planned myo-reps into straight sets, and `myo`/`mini` set types remain only so older workouts load and show. Set rows step weight and reps in place (`stepValue` with `stepFor`); the set editor sheet handles typing, set
type and delete. Saved workouts are edited through the store's
`updateSessionDetails`, `addSavedSet`, `removeSavedSet`, `addSavedExercise`, `removeSavedExercise` and
`deleteSession`: every saved set stays `done`, empty exercises and blocks are removed, and workouts stay sorted
newest first. Show sets with `setText()` (src/lib/format.ts) and records with `recordText()`,
never by hand, so "BW +10 kg × 6" and "45 s" stay consistent.

## Rest timer and sound

- Which rest follows a set is `restAfter` in `logic/rest.ts`: workout or routine rest, then the exercise default,
  then the app default; warmups at most 60 s; before an unlogged drop
  set, the scheme's `dropRestSec` (0 = no timer, and `upNext` takes the drop at once); supersets use
  `transitionSec` between exercises and `roundRestSec` after the round. `upNext` picks the set shown in the timer
  and scrolled to; `restCues` lists the beeps.
- The store schedules the cues (`scheduleCountdown`) whenever the rest or set timer changes. `sound.ts` plays them
  on the `AudioContext` clock, scheduled ahead, because background tabs throttle JS timers and a silent output
  sleeps (the first beep used to arrive late). A near-silent 40 Hz tone keeps the output awake while a countdown
  runs. Components only vibrate; don't play cue sounds from `$effect`s.
- With `pauseMusic`, the final cues are a generated WAV (under 5 s, with a 1 s lead-in) played through `<audio>`,
  so Chrome on Android takes transient audio focus and music apps pause. A late start seeks into the lead-in to
  stay on time. A JS timer starts the clip and can fire late in the background, so the same cues are also
  scheduled on the audio clock as a backup and stopped when the clip plays. The CSP allows `media-src blob:` for
  it. Audio focus can't be checked headless: test on a phone.
- Because the page plays audio during a rest, Chrome on Android shows a media notification. `media.ts` fills it
  through the Media Session API (next set, position, Kratos artwork from the PNG icons) and maps seek forward and
  back to ±15 s and next track to skip. Pause and play are no-ops: Chrome's default pause would stop the audio,
  and the beeps with it. The small Chrome badge on the notification can't be changed.

## Plans

There is no plan object: a plan is the part of a routine's name before " > " (`logic/plans.ts`: `planOf`, `dayOf`,
`groupByPlan`). `nextRoutine` picks Today's suggestion: the day after the latest workout's routine within its plan,
skipping workouts from routines without a plan. Keep it name-based unless plan-level data (schedules, deloads) is
needed.

## Exercise names

`Movement (variant, variant)` in sentence case: the movement people search for first (Curl, Row, Squat, Bench
press, Lateral raise, Pushdown, Leg curl), then the equipment, then position or grip, all lowercase except proper
names (Romanian, Pallof, TRX, EZ-bar). No "machine" suffix on the movement and no plurals:
`Curl (dumbbell, incline)`, `Leg curl (seated)`, `Pull-up (neutral grip)`.

The built-in library lives in `src/lib/repo/library.json`, the single source for both the app (`starter.ts`)
and `tools/fitnotes_to_kratos.py`. Each entry lists the FitNotes names it replaces. Keep ids stable; renaming is
fine. `starter.test.ts` enforces the convention.

## FitNotes conversion

`tools/fitnotes_to_kratos.py` reads a FitNotes backup (SQLite) read-only and writes a Kratos export file for
**Import from file**, so it goes through `parseExport` and `planMerge` like any import. It maps exercises through
`library.json`, renames the rest by rule and prints the mapping. Workouts are named after the routine day they
match, or "Workout"; days without a FitNotes workout timer start at noon UTC with an estimated duration. Importing
the same file twice adds nothing.

## Security

Treat every input as hostile: imported backups, data already in IndexedDB, and anything users type.

- Never use `{@html}`. Let Svelte escape text. Values that reach `style` go through allow-lists
  (see `gymColor`); URLs built from data use `encodeURIComponent`.
- Imported JSON goes through `parseBackup` (restore, replaces everything) or `parseExport` (import, merged by
  `planMerge` in `logic/merge.ts`: match by normalised name, skip what exists, remap ids, pull in referenced
  exercises and gyms). Never anything else. It rebuilds each object from known fields (so `__proto__` and
  unknown keys never get copied), checks types and ranges, and verifies references. Read untrusted objects with
  `Object.hasOwn`, never `in` or plain indexing.
- No secrets, tokens or real personal data in the repo. Test data is synthetic (`repo/mock.ts`).
- The dev server has no login: keep it on loopback by default. `DEV_HOST` binding elsewhere prints a warning.
- No framing: another site could steer taps on Erase all data. `vercel.json` (and `npm run preview`) send
  `X-Frame-Options: DENY` and `frame-ancestors 'none'`; GitHub Pages can't send headers, so `main.ts` also refuses
  to start inside a frame.
- One tab saves at a time: `Repo.claim` at start makes the newest tab the writer, and every write checks it in
  the same IndexedDB transaction (`OtherTabError` otherwise), so an older tab can't overwrite newer data or
  reconnect Drive after a disconnect.
- Plain HTTP on a LAN IP is not a secure context: no `crypto.randomUUID`, service worker, geolocation or wake
  lock. Use `uid()` (`src/lib/id.ts`), and give secure-context features a clear "needs HTTPS" message
  (see `locate()` in the store and `wakelock.svelte.ts`).
- Location is read only when a workout starts or the user taps "Use my location", always as a fresh fix.
- Google Drive: scope `drive.file` only. Access tokens live in memory (`DriveApi`), never in storage, URLs or
  logs; interactive sign-in only from a tap. Files from Drive go through `parseBackup`, Drive replies through
  `parseRemoteFile`, stored sync state through `parseSyncState`. Sync state records the account (Drive's
  `permissionId`); a token for another account is refused (`signIn` in the store) before any file is read or
  written. Sync never overwrites local changes made during a download, an erase on a synced device is never
  undone without asking, and settling a conflict re-checks Drive's version first. The OAuth client id is public and comes from
  `GOOGLE_CLIENT_ID`. The build adds a CSP (`vite.config.ts`) allowing only Google's sign-in script and
  the Drive API besides the app; extend it deliberately if a new origin is needed.
- `tools/` scripts open user backups read-only and write only their output file; never commit those files.

## Design system

Dark only. Tokens live on `:root` in `src/app.css`. Use them, don't hard-code colours.

- Surfaces `--iron-0..3` (`--iron-0` is near-black so cards on `--iron-1` stand out), text `--chalk`, `--chalk-dim`,
  `--chalk-faint`. Primary action = chalk background (`.btn.primary`: save, forms). The go action that moves a
  workout forward (start, log a set, finish, skip rest) is green (`.btn.go`, `--go`), in line with green = done or live.
  Header icon buttons are `.icon-btn.round`.
- Plate colours carry fixed meanings: blue = superset, green = done or live (and myo-reps in
  workouts logged before they were removed), yellow = progression/records,
  red = destructive. Don't reuse them for decoration. The logo (`Logo.svelte`, from `public/icon.svg`) is the one
  exception.
- Gym tags: `GYM_COLORS` in fixed order (red, blue, green, violet). The order was validated for colour-blind
  separation on `--iron-1`; re-run the palette check if it changes.
- Type: the system font stack (`--font`, same as Klepsydra and Vigo), no web fonts; `.num` adds tabular figures. Main controls are ≥ 44 px tall; secondary chips are smaller but keep 30 px or more.
- Charts follow `Chart.svelte`: 2 px lines, recessive grid, hover tooltip, table view, legend for ≥ 2 series.

## Testing in a browser

Use Playwright for Python from `~/.venv/bin/python`, headless, sync API. Keep scripts and screenshots outside the
repo. Exercise the changed flow, fail on console errors and page errors, and screenshot at 390×844 and
1280×800. To get realistic data, click **More → Load sample data** (a fresh browser profile starts empty). Test location
with Playwright's `geolocation` context option against `npm run preview` (not the LAN address).

README screenshots: 390×844 at device scale 2, sample data, against `npm run preview`; dismiss the gym notice and
any rest timer first. Replace the files in `docs/screenshots/` when the screens they show change.

## License

AGPL-3.0-or-later. New files need no per-file header; `LICENSE` covers the repository.

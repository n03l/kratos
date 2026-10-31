<script lang="ts">
  import Icon from '../lib/components/Icon.svelte';
  import Logo from '../lib/components/Logo.svelte';
  import RestPicker from '../lib/components/RestPicker.svelte';
  import Sheet from '../lib/components/Sheet.svelte';
  import { db, gymColor, saveGym, uid } from '../lib/store.svelte';
  import { navigate } from '../lib/router.svelte';
  import { formatWeight } from '../lib/logic/training';
  import { formatRest } from '../lib/logic/rest';
  import { formatDistance } from '../lib/logic/geo';
  import { GYM_COLORS } from '../lib/model';
  import DataTools from '../lib/components/DataTools.svelte';
  import { beep, unlockSound } from '../lib/sound';
  import { wake } from '../lib/wakelock.svelte';

  const settings = $derived(db().settings);
  const REPO_URL = 'https://github.com/n03l/kratos';

  function tryBeep() {
    unlockSound();
    if (settings.sound) setTimeout(() => beep('end', settings.soundVolume), 50);
  }

  let restOpen = $state(false);
  let draftRest = $state(120);
  function addGym() {
    const id = uid();
    saveGym({ id, name: 'New gym', color: GYM_COLORS[db().gyms.length % GYM_COLORS.length], bar: 20, plates: [20, 10, 5, 2.5], stackIncrement: 5 });
    navigate(`/gyms/${id}`);
  }

</script>

<section class="page">
  <h1 class="title">More</h1>

  <section class="section">
    <div class="spread">
      <h2 class="h2">Gyms</h2>
      <button class="btn sm ghost" onclick={addGym}><Icon name="plus" size={18} /> Add gym</button>
    </div>
    <ul class="list">
      {#each db().gyms as g (g.id)}
        <li>
          <a class="list-link" href="#/gyms/{encodeURIComponent(g.id)}">
            <span class="gym-dot big" style:background={gymColor(g)}></span>
            <span class="grow">
              <span class="h3">{g.name}{#if settings.defaultGymId === g.id}<span class="def small">Default</span>{/if}</span>
              <span class="small muted">{formatWeight(g.bar)} kg bar, plates {g.plates.map(formatWeight).join(' ')}, stacks +{formatWeight(g.stackIncrement)} kg</span>
              {#if g.location}<span class="small faint located"><Icon name="pin" size={14} /> Detected within {formatDistance(g.location.radiusM)}</span>{/if}
            </span>
            <Icon name="chevron" />
          </a>
        </li>
      {/each}
      <li>
        <label class="list-link">
          <span class="grow">
            <span class="h3">Detect gym at workout start</span>
            <span class="small muted">
              {db().gyms.some((g) => g.location)
                ? 'Checks your location once when a workout starts'
                : 'Save a location on a gym to use this'}
            </span>
          </span>
          <input class="switch" type="checkbox" bind:checked={settings.detectGym} />
        </label>
      </li>
    </ul>
  </section>

  <section class="section">
    <h2 class="h2">Training</h2>
    <ul class="list">
      <li><a class="list-link" href="#/routines"><Icon name="routine" /><span class="grow h3">Routines</span><Icon name="chevron" /></a></li>
    </ul>
  </section>

  <section class="section">
    <h2 class="h2">Rest timer</h2>
    <ul class="list">
      <li>
        <button class="list-link" onclick={() => { draftRest = settings.defaultRestSec; restOpen = true; }}>
          <Icon name="timer" />
          <span class="grow"><span class="h3">Default rest</span><span class="small muted">For exercises without their own rest</span></span>
          <span class="num val">{formatRest(settings.defaultRestSec)}</span>
        </button>
      </li>
      <li>
        <label class="list-link">
          <span class="grow"><span class="h3">Countdown sound</span><span class="small muted">Beeps at 10 seconds, for the last 3 seconds and at zero</span></span>
          <input class="switch" type="checkbox" bind:checked={settings.sound} onchange={tryBeep} />
        </label>
      </li>
      {#if settings.sound}
        <li class="volume">
          <label class="field" for="volume">
            <span class="h3">Beep volume <span class="num muted">{Math.round(settings.soundVolume * 100)}%</span></span>
          </label>
          <input id="volume" class="range" type="range" min="10" max="100" step="10" value={Math.round(settings.soundVolume * 100)}
            oninput={(e) => (settings.soundVolume = Math.min(1, Math.max(0.1, e.currentTarget.valueAsNumber / 100)))}
            onchange={tryBeep} />
        </li>
        <li>
          <label class="list-link">
            <span class="grow">
              <span class="h3">Pause music during the countdown</span>
              <span class="small muted">On Android, music apps pause for the last 3 seconds and carry on after</span>
            </span>
            <input class="switch" type="checkbox" bind:checked={settings.pauseMusic} />
          </label>
        </li>
      {/if}
      <li>
        <label class="list-link">
          <span class="grow"><span class="h3">Vibration</span><span class="small muted">On phones that support it</span></span>
          <input class="switch" type="checkbox" bind:checked={settings.vibrate} />
        </label>
      </li>
    </ul>
    <p class="small faint">Set rest per exercise from its card in a workout, in a routine, or on the exercise's Setup tab. Supersets have their own rest after each round.</p>
  </section>

  <section class="section">
    <h2 class="h2">Screen</h2>
    <ul class="list">
      <li>
        <label class="list-link">
          <span class="grow">
            <span class="h3">Keep screen on</span>
            <span class="small muted">
              {#if !wake.supported}
                {isSecureContext ? 'This browser can’t keep the screen on.' : 'Needs a secure connection: open the app over HTTPS or on localhost.'}
              {:else if settings.keepScreenOn && wake.active}
                The screen stays on while Kratos is open.
              {:else}
                Stops the screen dimming or locking while Kratos is open. Uses more battery.
              {/if}
            </span>
          </span>
          <input class="switch" type="checkbox" bind:checked={settings.keepScreenOn} disabled={!wake.supported} />
        </label>
      </li>
    </ul>
    {#if wake.error && settings.keepScreenOn}<p class="error small" role="alert">{wake.error}</p>{/if}
  </section>

  <section class="section">
    <h2 class="h2">Data</h2>
    <DataTools />
  </section>

  <footer class="build-info">
    <span class="app-name"><Logo size={24} /> Kratos</span>
    <a class="repo-link" href={REPO_URL} target="_blank" rel="noopener noreferrer" aria-label="Kratos on GitHub">
      <svg viewBox="0 0 16 16" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>
    </a>
    {#if __COMMIT__}
      <a class="repo-link version" href="{REPO_URL}/commit/{__COMMIT__}" target="_blank" rel="noopener noreferrer"
        title="Commit {__COMMIT__}">{__COMMIT__.slice(0, 7)}</a>
    {/if}
  </footer>
</section>

<Sheet bind:open={restOpen} title="Default rest">
  <form class="stack" onsubmit={(e) => { e.preventDefault(); settings.defaultRestSec = draftRest; restOpen = false; }}>
    <RestPicker bind:value={draftRest} label="After each set" />
    <button class="btn primary block">Save rest</button>
  </form>
</Sheet>

<style>
  .grow { flex: 1; display: grid; min-width: 0; text-align: left; }
  .big { width: 14px; height: 14px; }
  .def { margin-left: 8px; padding: 1px 8px; border-radius: 999px; background: var(--iron-2); color: var(--chalk-dim); font-weight: 500; }
  .val { font-size: 1.2rem; font-weight: 600; }
  .located { display: inline-flex; align-items: center; gap: 4px; }
  .error { margin: 0; padding: 10px 12px; border-radius: var(--r-sm); background: color-mix(in srgb, var(--plate-red) 14%, transparent); color: var(--ink-red); overflow-wrap: anywhere; }
  p { margin: 0; }
  .build-info { display: flex; justify-content: center; align-items: center; gap: 4px; padding-top: 8px; color: var(--chalk-faint); }
  .app-name { display: inline-flex; align-items: center; gap: 8px; margin-right: 6px; font-weight: 600; color: var(--chalk-dim); }
  .repo-link { display: grid; place-items: center; min-width: 36px; height: 36px; border-radius: var(--r-sm); color: var(--chalk-faint); text-decoration: none; }
  .repo-link:hover { color: var(--chalk-dim); }
  .volume { display: grid; gap: 4px; padding: 12px 0; }
  .range { width: 100%; height: 44px; margin: 0; accent-color: var(--chalk); }
  .version { padding: 0 4px; font-size: 0.875rem; font-family: ui-monospace, Menlo, Consolas, monospace; }
</style>

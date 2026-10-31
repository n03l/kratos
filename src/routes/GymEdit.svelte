<script lang="ts">
  import { untrack } from 'svelte';
  import Icon from '../lib/components/Icon.svelte';
  import { db, gym, locate, saveGym, setDefaultGym } from '../lib/store.svelte';
  import { formatDistance, parseCoords } from '../lib/logic/geo';
  import { formatWeight } from '../lib/logic/training';
  import { GYM_COLORS, type Gym } from '../lib/model';

  let { id }: { id: string } = $props();

  // The page is re-created per route, so reading the gym once is intended.
  const original = untrack(() => gym(id));
  let g = $state<Gym | null>(original ? structuredClone($state.snapshot(original)) : null);

  // Changes save as you make them, like everywhere else; saveGym keeps numbers in range and an empty name
  // falls back to the saved one.
  $effect(() => {
    const snap = g && $state.snapshot(g);
    // Untracked: saving reads the gym list it writes, which would re-run this effect forever.
    if (snap && snap.plates.length) untrack(() => saveGym(snap));
  });

  const SIZES = [25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5];
  const colorNames: Record<string, string> = { red: 'Red', blue: 'Blue', green: 'Green', violet: 'Violet' };

  /** At least one plate stays selected: plate loading needs some. */
  function togglePlate(p: number) {
    if (!g || (g.plates.length === 1 && g.plates[0] === p)) return;
    g.plates = g.plates.includes(p) ? g.plates.filter((x) => x !== p) : [...g.plates, p].sort((a, b) => b - a);
  }

  const RADII = [50, 100, 200, 500, 1000];
  let locating = $state(false);
  let locError = $state('');
  let locInfo = $state('');
  let coordsText = $state('');

  async function useHere() {
    if (!g) return;
    locating = true;
    locError = '';
    locInfo = '';
    try {
      const fix = await locate();
      g.location = { lat: round(fix.lat), lng: round(fix.lng), radiusM: g.location?.radiusM ?? 200 };
      locInfo = fix.accuracy > 100
        ? `Accurate to about ${formatDistance(fix.accuracy)}. For a better fix, try again near a window or outdoors.`
        : `Accurate to about ${formatDistance(fix.accuracy)}.`;
    } catch (err) {
      locError = (err as Error).message;
    } finally {
      locating = false;
    }
  }

  function useTyped() {
    if (!g) return;
    const c = parseCoords(coordsText);
    if (!c) {
      locError = 'Enter latitude and longitude like 45.4642, 9.1900 (copy them from a map app).';
      locInfo = '';
      return;
    }
    g.location = { lat: round(c.lat), lng: round(c.lng), radiusM: g.location?.radiusM ?? 200 };
    locError = '';
    locInfo = '';
    coordsText = '';
  }

  /** Five decimals is about a metre: enough for a gym, no false precision. */
  const round = (x: number) => Math.round(x * 1e5) / 1e5;
</script>

{#if !g}
  <section class="page">
    <a class="back" href="#/more"><Icon name="back" size={20} /> More</a>
    <h1 class="title">Gym not found</h1>
  </section>
{:else}
  <section class="page">
    <div>
      <a class="back" href="#/more"><Icon name="back" size={20} /> More</a>
      <h1 class="title">{g.name || 'Gym'}</h1>
    </div>

    <form class="stack form" onsubmit={(e) => e.preventDefault()}>
      <label class="field"><span>Name</span><input autocomplete="off" class="input" bind:value={g.name} maxlength="40"
        onchange={() => { if (g && !g.name.trim()) g.name = gym(id)?.name ?? 'Gym'; }} /></label>

      <fieldset class="field">
        <legend class="small muted">Colour tag</legend>
        <div class="colors">
          {#each GYM_COLORS as c (c)}
            <button type="button" class="swatch" aria-pressed={g.color === c} aria-label={colorNames[c]}
              style:background="var(--gym-{c})" onclick={() => (g!.color = c)}>
              {#if g.color === c}<Icon name="check" size={18} />{/if}
            </button>
          {/each}
        </div>
      </fieldset>

      <div class="two">
        <label class="field"><span>Bar weight (kg)</span><input autocomplete="off" class="input num" type="number" min="0" step="0.5" bind:value={g.bar} /></label>
        <label class="field"><span>Machine stack step (kg)</span><input autocomplete="off" class="input num" type="number" min="0.5" step="0.5" bind:value={g.stackIncrement} /></label>
      </div>

      <fieldset class="field">
        <legend class="small muted">Plates available</legend>
        <div class="plates">
          {#each SIZES as p (p)}
            <button type="button" class="chip num" aria-pressed={g.plates.includes(p)} onclick={() => togglePlate(p)}>{formatWeight(p)}</button>
          {/each}
        </div>
        <p class="small faint">Used for plate loading and to round barbell suggestions to weights you can make here. Keep at least one.</p>
      </fieldset>

      <fieldset class="field">
        <legend class="small muted">Location</legend>
        {#if g.location}
          <div class="loc">
            <span class="num">{g.location.lat.toFixed(5)}, {g.location.lng.toFixed(5)}</span>
            <span class="small muted">Detected when you start a workout within {formatDistance(g.location.radiusM)}.</span>
          </div>
          <div class="plates" role="group" aria-label="Detection radius">
            {#each RADII as r (r)}
              <button type="button" class="chip num" aria-pressed={g.location.radiusM === r} onclick={() => (g!.location!.radiusM = r)}>{formatDistance(r)}</button>
            {/each}
          </div>
        {:else}
          <p class="small faint">Save where this gym is, and Kratos picks it automatically when you start a workout there.</p>
        {/if}
        <div class="two">
          <button type="button" class="btn ghost" onclick={useHere} disabled={locating}>
            <Icon name="pin" size={18} /> {locating ? 'Locating…' : g.location ? 'Update to here' : 'Use my location'}
          </button>
          {#if g.location}
            <button type="button" class="btn ghost" onclick={() => { g!.location = undefined; locInfo = ''; }}>Remove location</button>
          {/if}
        </div>
        <div class="coords">
          <label class="sr-only" for="coords">Coordinates</label>
          <input id="coords" class="input num" placeholder="Or paste coordinates: 45.4642, 9.1900" bind:value={coordsText} inputmode="decimal" autocomplete="off" />
          <button type="button" class="btn ghost" onclick={useTyped} disabled={!coordsText.trim()}>Set</button>
        </div>
        {#if locError}<p class="small err" role="alert">{locError}</p>{/if}
        {#if locInfo}<p class="small muted" role="status">{locInfo}</p>{/if}
        <p class="small faint">Stored on this device and included in backups. Your location is only checked when you start a workout or tap the button.</p>
      </fieldset>

      {#if db().settings.defaultGymId !== g.id}
        <button type="button" class="btn ghost block" onclick={() => setDefaultGym(g!.id)}>Make default gym</button>
      {:else}
        <p class="small muted center">This is your default gym.</p>
      {/if}
    </form>
  </section>
{/if}

<style>
  .form { gap: 18px; }
  fieldset { border: 0; margin: 0; padding: 0; }
  legend { margin-bottom: 8px; }
  .colors { display: flex; gap: 12px; }
  .swatch {
    display: grid; place-items: center; width: 48px; height: 48px; border: 0; border-radius: 50%; color: #fff;
  }
  .swatch[aria-pressed='true'] { box-shadow: 0 0 0 3px var(--iron-0), 0 0 0 5px var(--chalk); }
  .two { display: grid; grid-template-columns: 1fr 1fr; align-items: end; gap: 10px; }
  .two > * { min-width: 0; }
  .two .btn { white-space: normal; padding: 0 12px; }
  .plates { display: flex; flex-wrap: wrap; gap: 8px; }
  .plates .chip { min-width: 54px; justify-content: center; font-size: 1.05rem; }
  .center { text-align: center; margin: 0; }
  .loc { display: grid; gap: 2px; margin-bottom: 4px; }
  .loc .num { font-size: 1.15rem; font-weight: 600; }
  .coords { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; }
  .err { color: var(--ink-red); margin: 0; }
  fieldset p { margin: 0; }
  fieldset.field { gap: 10px; }
  .btn:disabled { opacity: 0.4; }
</style>

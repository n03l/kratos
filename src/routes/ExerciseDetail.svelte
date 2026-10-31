<script lang="ts">
  import Chart, { type Point } from '../lib/components/Chart.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import {
    app, db, deleteExerciseById, exercise, setMeasure, gym, gymColor, historyFor, restoreExercise, saveExercise, setExerciseArchived,
    setSetupIncrement, setSetupNote, setupIncrement, setupNote,
  } from '../lib/store.svelte';
  import { exerciseNameProblem, exerciseUsage } from '../lib/logic/library';
  import ExerciseTags from '../lib/components/ExerciseTags.svelte';
  import { exerciseMeta, seconds, setText } from '../lib/format';
  import { navigate } from '../lib/router.svelte';
  import { e1rm, formatWeight, volume, workSets } from '../lib/logic/training';
  import { bestOf, repMaxes, type RecordKind } from '../lib/logic/records';
  import { isGymSpecificEquipment, isTimed } from '../lib/model';
  import { dayLabel } from '../lib/format';
  import { formatRest } from '../lib/logic/rest';
  import RestPicker from '../lib/components/RestPicker.svelte';
  import Sheet from '../lib/components/Sheet.svelte';

  let { id }: { id: string } = $props();

  const ex = $derived(exercise(id));
  let tab = $state<'history' | 'charts' | 'records' | 'setup'>('history');
  let allGyms = $state(false);
  // Long histories render in pages; the charts and records still use all of it.
  const PAGE = 20;
  let shown = $state(PAGE);
  let restOpen = $state(false);
  let deleteOpen = $state(false);
  let deleteError = $state('');
  const usage = $derived(ex ? exerciseUsage(db(), ex.id) : { routines: [], sessions: 0 });

  function confirmDelete() {
    if (!ex) return;
    const result = deleteExerciseById(ex.id);
    if (result === 'in-workout') {
      deleteError = 'Your workout in progress uses this exercise. Finish the workout or remove the exercise from it first.';
      return;
    }
    deleteOpen = false;
    if (result === 'removed') navigate('/exercises');
    // Archived: the notice with Restore is at the top of the page.
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  let draftRest = $state(120);
  let nameError = $state('');

  function rename(input: HTMLInputElement) {
    if (!ex) return;
    const name = input.value.trim().replace(/\s+/g, ' ');
    nameError = exerciseNameProblem(db(), ex.id, name);
    if (nameError) return;
    input.value = name;
    if (name !== ex.name) saveExercise({ ...ex, name });
  }

  const here = $derived(gym(app.gymId));
  const hist = $derived(ex ? historyFor(ex, app.gymId, allGyms) : []);
  const colorByGym = $derived(!!ex?.gymSpecific && allGyms);

  const allSets = $derived(hist.flatMap((h) => h.entry.sets));
  const weighted = $derived(workSets(allSets).some((s) => s.weight > 0));
  /** The headline measure: longest hold for timed exercises, most reps for unweighted bodyweight, else est. 1RM. */
  const mainKind = $derived<RecordKind>(isTimed(ex) ? 'hold' : ex?.equipment === 'bodyweight' ? 'reps' : 'e1rm');
  const main = $derived({
    hold: { title: 'Longest hold', unit: 's', total: 'Time held per workout', totalUnit: 's' },
    reps: { title: 'Most reps at bodyweight', unit: 'reps', total: 'Reps per workout', totalUnit: 'reps' },
    added: { title: 'Most added weight', unit: 'kg', total: 'Reps per workout', totalUnit: 'reps' },
    e1rm: { title: 'Estimated 1RM', unit: 'kg', total: 'Volume per workout', totalUnit: 'kg' },
  }[mainKind]);
  const total = (sets: typeof allSets) => {
    const w = workSets(sets);
    if (mainKind === 'hold') return w.reduce((t, s) => t + (s.durationSec ?? 0), 0);
    if (mainKind === 'reps') return w.reduce((t, s) => t + s.reps, 0);
    return Math.round(volume(sets));
  };

  const series = $derived.by(() => {
    const e: Point[] = [], top: Point[] = [], vol: Point[] = [];
    for (const { session, entry } of [...hist].reverse()) {
      const x = Date.parse(session.startedAt);
      const g = gym(session.gymId);
      const color = colorByGym ? gymColor(g) : undefined;
      const note = g?.name;
      const best = bestOf(entry.sets, mainKind);
      if (best) e.push({ x, y: Math.round(best.value * 10) / 10, color, note });
      const w = workSets(entry.sets);
      if (w.length) top.push({ x, y: Math.max(...w.map((s) => s.weight)), color, note });
      vol.push({ x, y: total(entry.sets), color, note });
    }
    return { e, top, vol };
  });

  const legend = $derived(
    colorByGym ? db().gyms.filter((g) => hist.some((h) => h.session.gymId === g.id)).map((g) => ({ label: g.name, color: gymColor(g) })) : [],
  );

  const rm = $derived(repMaxes(allSets));
  const best = $derived(bestOf(allSets, mainKind));
  const heaviest = $derived(workSets(allSets).reduce<null | (typeof allSets)[number]>((a, b) => (!a || b.weight > a.weight ? b : a), null));
  const bestTotal = $derived(hist.reduce<null | (typeof hist)[number]>((a, b) => (!a || total(b.entry.sets) > total(a.entry.sets) ? b : a), null));
  const fmtMain = (v: number) => (mainKind === 'hold' ? seconds(v) : mainKind === 'reps' ? `${v} reps` : `${v.toFixed(1)} kg`);
  const fmtTotal = (v: number) => (mainKind === 'hold' ? seconds(v) : mainKind === 'reps' ? `${v} reps` : `${v.toLocaleString()} kg`);
</script>

{#if !ex}
  <section class="page">
    <a class="back" href="#/exercises"><Icon name="back" size={20} /> Exercises</a>
    <h1 class="title">Exercise not found</h1>
  </section>
{:else}
  <section class="page">
    <div class="stack head">
      <a class="back" href="#/exercises"><Icon name="back" size={20} /> Exercises</a>
      <h1 class="title name">{ex.name}</h1>
      <p class="muted cap meta">{exerciseMeta(ex)}</p>
    </div>

    {#if ex.archived}
      <div class="archived" role="status">
        <p>
          <strong>Archived.</strong> Hidden from the exercise list and pickers.
          {#if usage.sessions}Its {usage.sessions} {usage.sessions === 1 ? 'workout stays' : 'workouts stay'} in your history.{/if}
          {#if usage.routines.length}Routines that include it still use it.{/if}
        </p>
        <button class="btn sm" onclick={() => restoreExercise(ex.id)}>Restore exercise</button>
      </div>
    {/if}

    {#if ex.gymSpecific}
      <div class="scope stack">
        <div class="seg" role="group" aria-label="Which gyms to include">
          <button aria-pressed={!allGyms} onclick={() => (allGyms = false)}>
            <span class="gym-dot" style:background={gymColor(here)}></span> {here?.name}
          </button>
          <button aria-pressed={allGyms} onclick={() => (allGyms = true)}>All gyms</button>
        </div>
        <p class="small faint">Machines differ between gyms, so this exercise shows {allGyms ? 'every gym, coloured by gym' : `${here?.name} only`}. Change gym from Today.</p>
      </div>
    {/if}

    <div class="seg tabs" role="tablist" aria-label="Exercise views">
      {#each [['history', 'History'], ['charts', 'Charts'], ['records', 'Records'], ['setup', 'Setup']] as [k, label] (k)}
        <button role="tab" aria-selected={tab === k} onclick={() => (tab = k as typeof tab)}>{label}</button>
      {/each}
    </div>

    {#if tab === 'history'}
      <ul class="list">
        {#each hist.slice(0, shown) as h, i (i)}
          <li class="hrow">
            <a class="spread plain" href="#/session/{encodeURIComponent(h.session.id)}">
              <span class="h3">{dayLabel(h.session.startedAt)}</span>
              <span class="small muted where"><span class="gym-dot" style:background={gymColor(gym(h.session.gymId))}></span>{gym(h.session.gymId)?.name}</span>
            </a>
            <p class="sets num">
              {#each h.entry.sets.filter((s) => s.type !== 'warmup') as s (s.id)}
                <span class:myo={s.type === 'myo' || s.type === 'mini'}>{s.type === 'mini' ? '+' : ''}{setText(s, ex)}</span>
              {/each}
            </p>
          </li>
        {:else}
          <li class="muted empty">No sets logged{ex.gymSpecific && !allGyms ? ` at ${here?.name}` : ''} yet.</li>
        {/each}
      </ul>
      {#if hist.length > shown}
        <button class="btn ghost block" onclick={() => (shown += PAGE * 5)}>Show more ({hist.length - shown} older)</button>
      {/if}
    {:else if tab === 'charts'}
      <div class="stack charts">
        <div class="surface pad"><Chart title={main.title} points={series.e} unit={main.unit} {legend} digits={mainKind === 'e1rm' ? 1 : 0} /></div>
        {#if weighted}
          <div class="surface pad"><Chart title={ex.equipment === 'bodyweight' ? 'Most added weight' : 'Top set weight'} points={series.top} {legend} /></div>
        {/if}
        <div class="surface pad"><Chart title={main.total} kind="bars" points={series.vol} unit={main.totalUnit} {legend} digits={0} /></div>
      </div>
    {:else if tab === 'records'}
      <dl class="recs">
        <div><dt>{main.title}</dt><dd class="num">{best ? fmtMain(best.value) : '–'}</dd>
          {#if best}<p class="small faint">{setText(best.set, ex)}</p>{/if}</div>
        {#if weighted && heaviest}
          <div><dt>{ex.equipment === 'bodyweight' ? 'Most added weight' : 'Heaviest'}</dt><dd class="num">{formatWeight(heaviest.weight)} kg</dd>
            <p class="small faint">{setText(heaviest, ex)}</p></div>
        {/if}
        <div><dt>Best workout</dt><dd class="num">{bestTotal ? fmtTotal(total(bestTotal.entry.sets)) : '–'}</dd>
          {#if bestTotal}<p class="small faint">{dayLabel(bestTotal.session.startedAt)}</p>{/if}</div>
      </dl>
      {#if mainKind === 'e1rm' && rm.size}
      <section class="section">
        <h2 class="h2">Best weight by reps</h2>
        <table class="rm">
          <thead><tr><th>Reps</th><th>Weight</th><th>Est. 1RM</th></tr></thead>
          <tbody>
            <!-- Only rep counts you've done; empty rows were most of the table. -->
            {#each [...rm.entries()].sort((a, b) => a[0] - b[0]) as [reps, s] (reps)}
              <tr>
                <td class="num">{reps}</td>
                <td class="num">{formatWeight(s.weight)} kg</td>
                <td class="num muted">{e1rm(s.weight, s.reps).toFixed(1)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </section>
      {/if}
    {:else}
      <div class="stack">
        <label class="field">
          <span>Name</span>
          <input class="input" value={ex.name} maxlength="80" autocomplete="off"
            oninput={() => (nameError = '')} onchange={(e) => rename(e.currentTarget)} />
        </label>
        {#if nameError}<p class="err small" role="alert">{nameError} The name wasn’t changed.</p>{/if}
        <ExerciseTags equipment={ex.equipment} muscles={ex.muscles}
          onequipment={(equipment) => saveExercise({ ...ex, equipment })} onmuscles={(muscles) => saveExercise({ ...ex, muscles })} />
        {#if ex.gymSpecific}
          {@const stack = isGymSpecificEquipment(ex.equipment)}
          <p class="muted small">
            Seat, pin and handle settings for each gym. They show on the workout screen when you train there.
            {#if stack}Step is the smallest weight jump on this machine; leave it empty to use the gym’s step.{/if}
          </p>
          {#each db().gyms as g (g.id)}
            <div class="gym-setup" class:with-step={stack}>
              <label class="field">
                <span class="where"><span class="gym-dot" style:background={gymColor(g)}></span>{g.name}</span>
                <input autocomplete="off" class="input" value={setupNote(ex.id, g.id) ?? ''} placeholder="e.g. Seat 4, pin 7"
                  onchange={(e) => setSetupNote(ex.id, g.id, e.currentTarget.value)} maxlength="200" />
              </label>
              {#if stack}
                <label class="field">
                  <span>Step (kg)</span>
                  <input autocomplete="off" class="input num" type="number" inputmode="decimal" min="0.1" max="100" step="0.1"
                    value={setupIncrement(ex.id, g.id) ?? ''} placeholder={formatWeight(g.stackIncrement)}
                    aria-label={`Weight step at ${g.name} (kg)`}
                    onchange={(e) => setSetupIncrement(ex.id, g.id, e.currentTarget.valueAsNumber)} />
                </label>
              {/if}
            </div>
          {/each}
        {:else}
          <p class="muted small">Free-weight exercises share history across gyms. Turn this on if the equipment differs from gym to gym.</p>
        {/if}
        <button class="rest-row" onclick={() => { draftRest = ex.restSec ?? db().settings.defaultRestSec; restOpen = true; }}>
          <Icon name="timer" />
          <span class="grow-col"><span class="h3">Rest after each set</span>
            <span class="small muted">{ex.restSec === undefined ? 'Uses the app default' : 'Default for this exercise'}. Routines can override it.</span></span>
          <span class="num val">{formatRest(ex.restSec ?? db().settings.defaultRestSec)}</span>
        </button>
        <fieldset class="field measure">
          <legend class="h3">Measured by</legend>
          <div class="seg">
            <button aria-pressed={!isTimed(ex)} onclick={() => setMeasure(ex.id, 'reps')}>Reps</button>
            <button aria-pressed={isTimed(ex)} onclick={() => setMeasure(ex.id, 'time')}>Time held</button>
          </div>
          <p class="small faint">Time held is for holds like planks and hangs. Switching resets this exercise's targets in your routines. {ex.equipment === 'bodyweight' ? 'Weight is what you add to your body; leave it empty for bodyweight only.' : 'Weight is optional.'}</p>
        </fieldset>
        <label class="toggle">
          <input type="checkbox" checked={ex.gymSpecific} onchange={(e) => saveExercise({ ...ex, gymSpecific: e.currentTarget.checked })} />
          <span class="h3">Different at each gym</span>
        </label>
        <label class="field">
          <span>Notes</span>
          <textarea class="input" value={ex.notes ?? ''} onchange={(e) => saveExercise({ ...ex, notes: e.currentTarget.value })} placeholder="Cues, grip, tempo"></textarea>
        </label>
        {#if !ex.archived}
          <button class="btn ghost block" onclick={() => { setExerciseArchived(ex.id, true); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Archive exercise</button>
        {/if}
        {#if !ex.archived || !usage.sessions}
          <button class="btn danger block" onclick={() => { deleteError = ''; deleteOpen = true; }}><Icon name="trash" /> Delete exercise</button>
        {/if}
      </div>
    {/if}
  </section>
{/if}

{#if ex}
  <Sheet bind:open={deleteOpen} title="Delete {ex.name}?">
    <div class="stack">
      <p class="muted">It's removed from your exercise list.</p>
      {#if usage.routines.length}
        <p class="muted">It's also taken out of {usage.routines.length === 1 ? 'the routine' : 'these routines'}: {usage.routines.join(', ')}.</p>
      {/if}
      {#if usage.sessions}
        <p class="muted">The {usage.sessions} {usage.sessions === 1 ? 'workout' : 'workouts'} in your history that include it stay as they are, with their charts and records, so it's archived instead. You can restore it from Exercises, Show archived.</p>
      {/if}
      {#if deleteError}<p class="err small" role="alert">{deleteError}</p>{/if}
      <button class="btn danger block" onclick={confirmDelete}>Delete exercise</button>
      <button class="btn ghost block" onclick={() => (deleteOpen = false)}>Cancel</button>
    </div>
  </Sheet>

  <Sheet bind:open={restOpen} title="Rest for {ex.name}">
    <form class="stack" onsubmit={(e) => { e.preventDefault(); saveExercise({ ...ex, restSec: draftRest }); restOpen = false; }}>
      <RestPicker bind:value={draftRest} label="After each set" />
      <button class="btn primary block">Save rest</button>
      {#if ex.restSec !== undefined}
        <button type="button" class="btn ghost block" onclick={() => { const { restSec: _, ...rest } = ex; saveExercise(rest); restOpen = false; }}>Use the app default</button>
      {/if}
    </form>
  </Sheet>
{/if}

<style>
  .archived {
    display: grid; gap: 10px; justify-items: start; padding: 12px 14px; border-radius: var(--r-md);
    background: var(--iron-1); box-shadow: inset 3px 0 0 var(--chalk-faint);
  }
  .archived p, .stack p { margin: 0; }
  .err { color: var(--ink-red); }
  .measure { border: 0; margin: 0; padding: 0; display: grid; gap: 8px; }
  .measure legend { margin-bottom: 8px; padding: 0; }
  .measure p { margin: 0; }
  .rest-row {
    display: flex; align-items: center; gap: 12px; width: 100%; min-height: 60px; padding: 10px 14px;
    border: 0; border-radius: var(--r-md); background: var(--iron-1); text-align: left;
  }
  .rest-row :global(svg) { color: var(--chalk-dim); flex: none; }
  .grow-col { flex: 1; display: grid; min-width: 0; }
  .val { font-size: 1.2rem; font-weight: 600; }
  .head { gap: 4px; }
  .name { overflow-wrap: anywhere; }
  .meta { margin: 0; }
  .cap { text-transform: capitalize; }
  .scope { gap: 6px; }
  .scope p { margin: 0; }
  .seg button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .plain { text-decoration: none; color: inherit; }
  .hrow { padding: 12px 0; }
  .where { display: inline-flex; align-items: center; gap: 6px; }
  .gym-setup { display: grid; gap: 10px; }
  .gym-setup.with-step { grid-template-columns: minmax(0, 1fr) 6.5rem; align-items: end; }
  .sets { display: flex; flex-wrap: wrap; gap: 4px 12px; margin: 6px 0 0; font-size: 1.1rem; color: var(--chalk-dim); }
  .sets .myo { color: var(--ink-green); }
  .empty { padding: 20px 0; }
  .recs { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; margin: 0; }
  .recs div { padding: 14px; border-radius: var(--r-md); background: var(--iron-1); }
  .recs p { margin: 2px 0 0; }
  dt { font-size: 0.9375rem; color: var(--chalk-dim); }
  dd { margin: 2px 0 0; font-size: 1.6rem; font-weight: 600; }
  .rm { width: 100%; border-collapse: collapse; font-size: 1.05rem; }
  .rm th { text-align: left; font: 500 0.9375rem var(--font); color: var(--chalk-dim); padding-bottom: 6px; }
  .rm td { padding: 6px 0; border-top: 1px solid var(--line); }
  .toggle { display: flex; gap: 12px; align-items: center; }
</style>

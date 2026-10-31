<script lang="ts">
  import ExerciseCard from '../lib/components/ExerciseCard.svelte';
  import ExercisePicker from '../lib/components/ExercisePicker.svelte';
  import GymChip from '../lib/components/GymChip.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import Sheet from '../lib/components/Sheet.svelte';
  import RestPicker from '../lib/components/RestPicker.svelte';
  import {
    addExercise, app, db, discardWorkout, exercise, finishWorkout, gym, gymColor, logUnticked, renameWorkout, setBlockRest, startRest,
    switchGym, unloggedSets,
  } from '../lib/store.svelte';
  import { formatRest, itemRest } from '../lib/logic/rest';
  import type { SessionBlock } from '../lib/model';
  import { navigate } from '../lib/router.svelte';
  import { clock } from '../lib/format';
  import { dayOf, planOf } from '../lib/logic/plans';

  let picking = $state(false);
  let menuOpen = $state(false);
  let gymOpen = $state(false);
  let renaming = $state(false);
  let draftName = $state('');
  let finishing = $state(false);
  let discarding = $state(false);

  const s = $derived(app.active);
  const allSets = $derived(s?.blocks.flatMap((b) => b.items).flatMap((i) => i.sets) ?? []);
  const doneCount = $derived(allSets.filter((x) => x.done).length);
  const unlogged = $derived(s ? unloggedSets(s) : []);
  const currentGym = $derived(gym(app.gymId));

  /** Close the options sheet, then run the action (one sheet at a time). */
  function menu(fn: () => void) {
    menuOpen = false;
    fn();
  }

  function saveName() {
    if (s) renameWorkout(draftName, planOf(s.name));
    renaming = false;
  }
  const unloggedCount = $derived(unlogged.reduce((n, u) => n + u.sets.length, 0));

  /** Superset letters: A for the first superset, B for the next, and so on. */
  const letters = $derived.by(() => {
    let n = 0;
    return (s?.blocks ?? []).map((b) => (b.items.length > 1 ? String.fromCharCode(65 + n++) : ''));
  });

  const ctx = () => ({
    name: (id: string) => exercise(id)?.name ?? '',
    exerciseRest: (id: string) => exercise(id)?.restSec,
    defaultRest: db().settings.defaultRestSec,
  });
  const roundRest = (b: SessionBlock) => b.roundRestSec ?? Math.max(...b.items.map((i) => itemRest(i, ctx())));
  const routineName = $derived(db().routines.find((r) => r.id === s?.routineId)?.name);

  let ssBlock = $state<SessionBlock | null>(null);
  let ssOpen = $state(false);
  let ssRound = $state(0);
  let ssBetween = $state(0);
  let ssRoutine = $state(false);

  function openSuperset(b: SessionBlock) {
    ssBlock = b;
    ssRound = roundRest(b);
    ssBetween = b.transitionSec ?? 0;
    ssRoutine = false;
    ssOpen = true;
  }

  function saveSuperset() {
    if (ssBlock) setBlockRest(ssBlock, ssRound, ssBetween, { routine: ssRoutine });
    ssOpen = false;
  }

  // Bring the next set into view when an exercise is finished or a rest is dismissed (see scrollToNext).
  $effect(() => {
    const req = app.scrollTo;
    if (!req) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.getElementById(`set-${req.setId}`)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
  });

  let finishError = $state('');

  function finish() {
    const r = finishWorkout();
    if (r && 'error' in r) {
      finishError = r.error;
      return;
    }
    finishing = false;
    finishError = '';
    if (r) navigate(`/done/${r.id}`);
  }
</script>

{#if !s}
  <section class="page">
    <h1 class="title">No workout in progress</h1>
    <p class="muted">Start a routine or an empty workout from Today.</p>
    <a class="btn primary" href="#/">Go to Today</a>
  </section>
{:else}
  <section class="page workout">
    <header class="bar">
      <div class="top">
        <div class="grow">
          <h1 class="wname">{s.name}</h1>
          <span class="num elapsed muted">{clock(app.now - Date.parse(s.startedAt))} · {doneCount} of {allSets.length} sets</span>
        </div>
        <button class="icon-btn round" onclick={() => (menuOpen = true)} aria-label="Workout options"><Icon name="more" /></button>
        <button class="btn sm go" onclick={() => (finishing = true)}>Finish</button>
      </div>
      <div class="progress" role="progressbar" aria-label="Sets logged" aria-valuemin={0} aria-valuemax={allSets.length} aria-valuenow={doneCount}>
        <div class="fill" style:transform="scaleX({allSets.length ? doneCount / allSets.length : 0})"></div>
      </div>
    </header>

    {#if app.gymNotice}
      <div class="gym-notice small" class:busy={app.gymNotice.busy} role="status">
        <Icon name="pin" size={18} />
        <span class="grow-text">{app.gymNotice.text}</span>
        {#if app.gymNotice.undoGymId}
          <button class="btn sm ghost" onclick={() => { switchGym(app.gymNotice!.undoGymId!); app.gymNotice = null; }}>
            Use {gym(app.gymNotice.undoGymId)?.name}
          </button>
        {/if}
        {#if !app.gymNotice.busy}
          <button class="icon-btn" onclick={() => (app.gymNotice = null)} aria-label="Dismiss"><Icon name="close" size={18} /></button>
        {/if}
      </div>
    {/if}

    {#each s.blocks as block, bi (block.id)}
      {#if block.items.length > 1}
        <section class="superset" aria-label="Superset {letters[bi]}">
          <div class="ss-head">
            <span class="small"><Icon name="link" size={16} /> Superset {letters[bi]}</span>
            <button class="ss-rest small num" onclick={() => openSuperset(block)} aria-label="Superset {letters[bi]} rest: {formatRest(block.transitionSec ?? 0)} between exercises, {formatRest(roundRest(block))} after each round. Change">
              <Icon name="timer" size={16} />
              {block.transitionSec ? `${formatRest(block.transitionSec)} between, ` : ''}{formatRest(roundRest(block))} after round
            </button>
          </div>
          {#each block.items as item, ii (item.exerciseId + ii)}
            <ExerciseCard {item} blockIndex={bi} itemIndex={ii} blockCount={s.blocks.length} label="{letters[bi]}{ii + 1}" />
          {/each}
        </section>
      {:else}
        <ExerciseCard item={block.items[0]} blockIndex={bi} itemIndex={0} blockCount={s.blocks.length} />
      {/if}
    {:else}
      <div class="empty surface">
        <p class="h3">No exercises yet</p>
        <p class="muted small">Add the first exercise to start logging sets.</p>
      </div>
    {/each}

    <div class="stack">
      <button class="btn block" onclick={() => (picking = true)}><Icon name="plus" /> Add exercise</button>
    </div>
  </section>

  <ExercisePicker bind:open={picking} onpick={addExercise} />
  <GymChip chip={false} bind:open={gymOpen} />

  <Sheet bind:open={menuOpen} title="Workout options">
    <ul class="list options">
      <li><button class="list-link" onclick={() => menu(() => startRest(db().settings.defaultRestSec, 'Rest'))}>
        <Icon name="timer" /><span class="opt">Start a rest timer</span><span class="muted num">{formatRest(db().settings.defaultRestSec)}</span>
      </button></li>
      <li><button class="list-link" onclick={() => menu(() => (gymOpen = true))}>
        <Icon name="pin" /><span class="opt">Gym</span>
        <span class="muted gym-name"><span class="gym-dot" style:background={gymColor(currentGym)}></span>{currentGym?.name}</span>
      </button></li>
      <li><button class="list-link" onclick={() => menu(() => (picking = true))}><Icon name="plus" /><span class="opt">Add exercise</span></button></li>
      <li><button class="list-link" onclick={() => menu(() => { draftName = dayOf(s.name); renaming = true; })}>
        <Icon name="edit" /><span class="opt">Rename workout</span>
      </button></li>
      <li><button class="list-link destructive" onclick={() => menu(() => (discarding = true))}><Icon name="trash" /><span class="opt">Discard workout</span></button></li>
    </ul>
  </Sheet>

  <Sheet bind:open={renaming} title="Rename workout">
    <form class="stack" onsubmit={(e) => { e.preventDefault(); saveName(); }}>
      <label class="field">
        <span>Name</span>
        <input autocomplete="off" class="input" maxlength="60" bind:value={draftName} />
      </label>
      <button class="btn primary block" disabled={!draftName.trim()}>Save name</button>
    </form>
  </Sheet>

  <Sheet bind:open={finishing} title="Finish workout">
    <div class="stack">
      {#if unloggedCount}
        <p class="muted">{doneCount} {doneCount === 1 ? 'set' : 'sets'} logged. {unloggedCount} {unloggedCount === 1 ? 'set isn’t' : 'sets aren’t'} ticked:</p>
        <ul class="unticked">
          {#each unlogged as u (u.item)}
            <li><span>{exercise(u.item.exerciseId)?.name ?? 'Exercise'}</span><span class="num muted">{u.sets.length} {u.sets.length === 1 ? 'set' : 'sets'}</span></li>
          {/each}
        </ul>
      {:else}
        <p class="muted">{doneCount} {doneCount === 1 ? 'set' : 'sets'} logged.</p>
      {/if}
      <label class="field">
        <span>Notes</span>
        <textarea class="input" maxlength="5000" bind:value={s.notes} placeholder="How did it feel? Anything to change next time?"></textarea>
      </label>
      {#if unloggedCount}
        <button class="btn primary block" onclick={() => { logUnticked(); finish(); }}>Log them as planned and save</button>
        <button class="btn ghost block" onclick={finish} disabled={doneCount === 0}>Save without them</button>
      {:else}
        <button class="btn primary block" onclick={finish} disabled={doneCount === 0}>Save workout</button>
      {/if}
      {#if doneCount === 0 && !unloggedCount}<p class="small faint">Log at least one set to save this workout.</p>{/if}
      {#if finishError}<p class="error small" role="alert">{finishError}</p>{/if}
    </div>
  </Sheet>

  <Sheet bind:open={ssOpen} title="Superset rest">
    <form class="stack ss-form" onsubmit={(e) => { e.preventDefault(); saveSuperset(); }}>
      <p class="muted small">Do one set of each exercise in turn. The round rest starts after the last one.</p>
      <RestPicker bind:value={ssRound} label="After each round" />
      <RestPicker bind:value={ssBetween} label="Between exercises" presets={[0, 10, 15, 30, 45, 60]} step={5} />
      {#if routineName}
        <label class="check"><input type="checkbox" bind:checked={ssRoutine} /> Save to the {routineName} routine</label>
      {/if}
      <button class="btn primary block">Save rest</button>
    </form>
  </Sheet>

  <Sheet bind:open={discarding} title="Discard this workout?">
    <div class="stack">
      <p class="muted">The {doneCount} logged {doneCount === 1 ? 'set' : 'sets'} will be lost.</p>
      <button class="btn danger block" onclick={() => { discardWorkout(); discarding = false; navigate('/'); }}>Discard workout</button>
      <button class="btn ghost block" onclick={() => (discarding = false)}>Keep going</button>
    </div>
  </Sheet>
{/if}

<style>
  .workout { gap: 14px; }
  .error { margin: 0; padding: 10px 12px; border-radius: var(--r-sm); background: color-mix(in srgb, var(--plate-red) 14%, transparent); color: var(--ink-red); overflow-wrap: anywhere; }
  .bar {
    position: sticky; top: 0; z-index: 10;
    display: grid; gap: 8px;
    margin: -16px -16px 4px; padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 10px;
    background: color-mix(in srgb, var(--iron-0) 94%, transparent);
    backdrop-filter: blur(12px);
    border-bottom: 1px solid var(--line);
  }
  .top { display: flex; align-items: center; gap: 8px; }
  .grow { flex: 1; min-width: 0; display: grid; }
  .wname { font: 600 1.125rem/1.2 var(--font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .elapsed { font-size: 0.9375rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .progress { height: 3px; border-radius: 2px; background: var(--iron-2); overflow: hidden; }
  .progress .fill { height: 100%; background: var(--go); transform-origin: left; transition: transform 250ms ease-out; }
  .opt { flex: 1; }
  .gym-name { display: inline-flex; align-items: center; gap: 8px; max-width: 50%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  .superset {
    display: grid; gap: 6px; padding: 10px 0 0 10px;
    border-left: 3px solid var(--plate-blue);
    border-radius: 0 var(--r-lg) var(--r-lg) 0;
  }
  .ss-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 2px; color: var(--ink-blue); }
  .ss-head > span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
  .ss-rest {
    display: inline-flex; align-items: center; gap: 6px; min-height: 30px; padding: 0 8px; border-radius: var(--r-sm);
    border: 0; background: none; color: var(--ink-blue); text-align: left;
  }
  .ss-rest:hover { background: var(--iron-2); }
  .ss-form { gap: 20px; }
  .check { display: flex; align-items: center; gap: 10px; min-height: 40px; }

  .gym-notice {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 8px 8px 8px 12px;
    border-radius: var(--r-md); background: var(--iron-1); color: var(--chalk-dim);
  }
  .gym-notice :global(svg:first-child) { flex: none; color: var(--chalk-faint); }
  .gym-notice.busy :global(svg:first-child) { animation: blink 1.2s ease-in-out infinite; }
  @keyframes blink { 50% { opacity: 0.3; } }
  .grow-text { flex: 1 1 180px; min-width: 0; }
  .empty { padding: 28px 18px; text-align: center; }
  .empty p { margin: 0; }
  .unticked { list-style: none; margin: -4px 0 0; padding: 0; display: grid; gap: 4px; }
  .unticked li { display: flex; justify-content: space-between; gap: 12px; }
  .btn:disabled { opacity: 0.4; }

  @media (min-width: 900px) {
    .bar { margin-top: -40px; padding-top: 16px; }
  }
</style>

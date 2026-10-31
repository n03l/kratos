<script lang="ts">
  import type { LoggedSet, SessionExercise } from '../model';
  import { formatWeight } from '../logic/training';
  import {
    addSet, app, db, exercise, gym, lastSets, linkWithNext, moveBlock, removeExercise, removeSet,
    setItemRest, setupNote, stepFor, startSetTimer, stopSetTimer, suggestionFor, toggleDone, unlink,
  } from '../store.svelte';
  import { isTimed } from '../model';
  import { dropsText, seconds, setsSummary, setText } from '../format';
  import { formatRest } from '../logic/rest';
  import RestPicker from './RestPicker.svelte';
  import Icon from './Icon.svelte';
  import PlateStrip from './PlateStrip.svelte';
  import SetEditor from './SetEditor.svelte';
  import SetRow from './SetRow.svelte';
  import Sheet from './Sheet.svelte';

  let {
    item, blockIndex, itemIndex, blockCount, label,
  }: { item: SessionExercise; blockIndex: number; itemIndex: number; blockCount: number; label?: string } = $props();

  const ex = $derived(exercise(item.exerciseId)!);
  const timed = $derived(isTimed(ex));
  const bodyweight = $derived(ex.equipment === 'bodyweight');
  const gymId = $derived(app.active?.gymId ?? app.gymId);
  const g = $derived(gym(gymId)!);
  const note = $derived(ex.gymSpecific ? setupNote(ex.id, gymId) : undefined);
  const previous = $derived(lastSets(ex, gymId) ?? []);
  const suggestion = $derived(suggestionFor(item.plan, ex, gymId));
  const warmups = $derived(item.sets.filter((s) => s.type === 'warmup'));
  const warmupsDone = $derived(warmups.length > 0 && warmups.every((s) => s.done));
  const plateWeight = $derived(
    item.sets.find((s) => s.type !== 'warmup' && !s.done)?.weight ?? item.sets.findLast((s) => s.type !== 'warmup')?.weight ?? 0,
  );
  const inSuperset = $derived(label !== undefined);
  /** "110 kg × 7, 5, 6": last time's working sets (saved sets are all done), in place of a column beside each set. */
  const lastText = $derived(setsSummary(previous, ex));

  const restSec = $derived(item.plan?.restSec ?? ex.restSec ?? db().settings.defaultRestSec);
  const routineName = $derived(db().routines.find((r) => r.id === app.active?.routineId)?.name);

  let restOpen = $state(false);
  let draftRest = $state(0);
  let asDefault = $state(false);
  let toRoutine = $state(false);

  function openRest() {
    draftRest = restSec;
    asDefault = false;
    toRoutine = false;
    restOpen = true;
  }

  function saveRest() {
    setItemRest(item, draftRest, { exerciseDefault: asDefault, routine: toRoutine });
    restOpen = false;
  }

  // A finished exercise folds to one line so the next one moves up; tap to open it again.
  const finished = $derived(item.sets.length > 0 && item.sets.every((s) => s.done));
  let reopened = $state(false);
  const folded = $derived(finished && !reopened);
  $effect(() => {
    if (!finished) reopened = false;
  });

  let showWarmups = $state(false);
  let menuOpen = $state(false);
  let editing = $state<LoggedSet | null>(null);
  let editorOpen = $state(false);

  /** Badge text and the matching set from last time, paired by type and position. */
  function describe(set: LoggedSet) {
    const sameType = item.sets.filter((s) => s.type === set.type);
    const n = sameType.indexOf(set);
    const prev = previous.filter((s) => s.type === set.type)[n];
    const workingNo = item.sets.filter((s) => s.type === 'working' || s.type === 'drop').indexOf(set) + 1;
    const badge = { warmup: 'W', working: String(workingNo), myo: 'M', mini: `+${n + 1}`, drop: 'D' }[set.type];
    return { badge, prev };
  }

  function schemeText() {
    const s = item.plan?.scheme;
    if (!s) return ex.muscles.join(', ');
    if (s.kind === 'straight') return `${s.sets} sets of ${s.repsMin}–${s.repsMax} reps${dropsText(s)}`;
    return `${s.sets} holds of ${seconds(s.secMin)}–${seconds(s.secMax)}`;
  }

  const reasons = $derived({
    first: 'First time here.',
    increase: 'You hit the top of the range last time.',
    'more-reps': timed ? 'Same weight, 5 s longer than last time.' : 'Same weight, one more rep than last time.',
    repeat: 'Repeat last time’s weight.',
  });

  function edit(set: LoggedSet) {
    editing = set;
    editorOpen = true;
  }

  /** "Set 2 · Bench press", "Warmup set · Bench press". */
  function editorTitle(set: LoggedSet | null) {
    if (!set) return ex.name;
    const { badge } = describe(set);
    const kind = { warmup: 'Warmup set', working: `Set ${badge}`, myo: 'Activation set', mini: `Mini-set ${badge}`, drop: 'Drop set' }[set.type];
    return `${kind} · ${ex.name}`;
  }

  function act(fn: () => void) {
    fn();
    menuOpen = false;
  }
</script>

<article class="card" class:linked={inSuperset} class:timed class:folded>
  {#if folded}
    <button class="fold-row" onclick={() => (reopened = true)} aria-label="{ex.name}, done: {setsSummary(item.sets, ex)}. Show sets">
      {#if label}<span class="ss num" aria-hidden="true">{label}</span>{/if}
      <span class="done-mark" aria-hidden="true"><Icon name="check" size={16} /></span>
      <span class="fold-text">
        <span class="h3 name">{ex.name}</span>
        <span class="small muted num">{setsSummary(item.sets, ex) || 'Warmups only'}</span>
      </span>
      <Icon name="down" size={18} />
    </button>
  {:else}
  <header class="head">
    {#if label}<span class="ss num" aria-label="Superset {label}">{label}</span>{/if}
    <div class="titles">
      <a class="h3 name" href="#/exercises/{encodeURIComponent(ex.id)}">{ex.name}</a>
      <div class="meta small">
        <span>{schemeText()}</span>
        {#if !inSuperset}
          <button class="rest" onclick={openRest} aria-label="Rest timer for {ex.name}: {formatRest(restSec)}. Change">
            <Icon name="timer" size={15} />
            <span class="num">Rest {formatRest(restSec)}</span>
          </button>
        {/if}
      </div>
    </div>
    {#if finished}
      <button class="icon-btn" onclick={() => (reopened = false)} aria-label="Fold {ex.name}"><Icon name="up" /></button>
    {/if}
    <button class="icon-btn" onclick={() => (menuOpen = true)} aria-label="Options for {ex.name}"><Icon name="menu" /></button>
  </header>

  {#if note}
    <p class="note small"><Icon name="pin" size={16} /><span>{note}</span></p>
  {/if}

  {#if suggestion}
    <p class="suggest small">
      <span class="target num">Today {setText({ weight: suggestion.weight, reps: suggestion.reps, durationSec: suggestion.sec }, ex)}</span>
      <span class="small muted">{reasons[suggestion.reason]}</span>
    </p>
  {/if}

  {#if lastText}
    <p class="last small muted"><span class="faint">Last time</span> <span class="num">{lastText}</span></p>
  {/if}

  {#if ex.equipment === 'barbell' && plateWeight > 0}
    <PlateStrip weight={plateWeight} gym={g} />
  {/if}

  <div class="sets">
    <div class="cols small faint" aria-hidden="true">
      <span></span><span>{bodyweight ? '+kg' : 'kg'}</span><span>{timed ? 'Time' : 'Reps'}</span>{#if timed}<span></span>{/if}<span></span>
    </div>

    {#if warmups.length && warmupsDone && !showWarmups}
      <button class="warm-toggle small" onclick={() => (showWarmups = true)}>
        {warmups.length} warmup {warmups.length === 1 ? 'set' : 'sets'} done, up to {formatWeight(Math.max(...warmups.map((w) => w.weight)))} kg
      </button>
    {/if}

    {#each item.sets as set (set.id)}
      {#if set.type !== 'warmup' || !warmupsDone || showWarmups}
        {@const d = describe(set)}
        <SetRow {set} badge={d.badge} step={stepFor(ex, g)} {timed} {bodyweight}
          ontimer={() => (app.setTimer?.setId === set.id ? stopSetTimer(blockIndex, itemIndex, set) : startSetTimer(set))}
          ondone={() => toggleDone(blockIndex, itemIndex, set)}
          onedit={() => edit(set)} />
      {/if}
    {/each}
  </div>

  <div class="foot">
    <button class="btn sm ghost add" onclick={() => addSet(item, 'working')}>
      <Icon name="plus" size={18} /> Add set
    </button>
  </div>
  {/if}
</article>

<Sheet bind:open={menuOpen} title={ex.name}>
  <div class="actions">
    <button class="btn ghost block" onclick={() => act(() => { addSet(item, 'warmup'); showWarmups = true; })}>Add warmup set</button>
    <button class="btn ghost block" onclick={() => act(() => addSet(item, 'drop'))}>Add drop set</button>
    {#if !inSuperset}
      <button class="btn ghost block" onclick={() => act(openRest)}><Icon name="timer" /> Rest timer</button>
    {/if}
    {#if !inSuperset && blockIndex < blockCount - 1}
      <button class="btn ghost block" onclick={() => act(() => linkWithNext(blockIndex))}><Icon name="link" /> Superset with next exercise</button>
    {/if}
    {#if inSuperset}
      <button class="btn ghost block" onclick={() => act(() => unlink(blockIndex, itemIndex))}><Icon name="unlink" /> Remove from superset</button>
      {#if blockIndex < blockCount - 1}
        <button class="btn ghost block" onclick={() => act(() => linkWithNext(blockIndex))}><Icon name="link" /> Add next exercise to superset</button>
      {/if}
    {/if}
    <div class="two">
      <button class="btn ghost" disabled={blockIndex === 0} onclick={() => act(() => moveBlock(blockIndex, -1))}><Icon name="up" /> Move up</button>
      <button class="btn ghost" disabled={blockIndex === blockCount - 1} onclick={() => act(() => moveBlock(blockIndex, 1))}><Icon name="down" /> Move down</button>
    </div>
    <button class="btn danger block" onclick={() => act(() => removeExercise(blockIndex, itemIndex))}><Icon name="trash" /> Remove exercise</button>
  </div>
</Sheet>

<Sheet bind:open={restOpen} title="Rest timer">
  <form class="stack rest-form" onsubmit={(e) => { e.preventDefault(); saveRest(); }}>
    <p class="muted small">{ex.name}{inSuperset ? '. The superset’s own rest applies after each round.' : ''}</p>
    {#if !inSuperset}<RestPicker bind:value={draftRest} label="After each set" />{/if}
    {#if !inSuperset}
      <label class="check"><input type="checkbox" bind:checked={asDefault} /> Use as the default for {ex.name}</label>
    {/if}
    {#if routineName}
      <label class="check"><input type="checkbox" bind:checked={toRoutine} /> Save to the {routineName} routine</label>
    {/if}
    <button class="btn primary block">Save rest</button>
  </form>
</Sheet>

<SetEditor bind:open={editorOpen} set={editing} {item} {ex} gym={g} title={editorTitle(editing)}
  previous={editing ? describe(editing).prev : undefined}
  ondelete={(set) => removeSet(item, set.id)}
  onlog={(set) => {
    editorOpen = false;
    toggleDone(blockIndex, itemIndex, set);
  }} />

<style>
  .card {
    --set-cols: 28px minmax(0, 1.15fr) minmax(0, 1fr) 44px;
    display: grid;
    gap: 12px;
    padding: 16px 14px 10px;
    background: var(--iron-1);
    border-radius: var(--r-lg);
    scroll-margin-top: 130px;
  }
  .card.linked { border-radius: var(--r-md); }
  .card.folded { padding: 0; }
  .fold-row {
    display: flex; align-items: center; gap: 10px; width: 100%; min-height: 60px; padding: 10px 14px;
    border: 0; border-radius: inherit; background: none; color: inherit; text-align: left;
  }
  .fold-row > :global(svg) { flex: none; color: var(--chalk-faint); }
  .fold-text { flex: 1; display: grid; min-width: 0; }
  .fold-text .name { font-size: 1.0625rem; }
  .done-mark {
    flex: none; display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%;
    background: var(--go); color: var(--on-go);
  }
  /* Room for the sticky workout bar when scrolled to. */
  .card :global(.row) { scroll-margin: 140px 0 calc(var(--nav-h) + 110px); }
  .head { display: flex; align-items: flex-start; gap: 10px; }
  .titles { flex: 1; min-width: 0; }
  .name { display: block; text-decoration: none; overflow-wrap: anywhere; font-size: 1.125rem; }
  .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0 12px; margin-top: 2px; color: var(--chalk-dim); }
  .ss {
    flex: none; display: grid; place-items: center; width: 34px; height: 28px; margin-top: 1px;
    border-radius: 6px; background: color-mix(in srgb, var(--plate-blue) 25%, transparent);
    color: var(--ink-blue); font-weight: 700; font-size: 1rem;
  }
  .rest {
    display: inline-flex; align-items: center; gap: 5px; min-height: 30px; margin: 0 -6px; padding: 0 6px;
    border: 0; border-radius: var(--r-sm); background: none; color: var(--chalk-dim);
  }
  .rest:hover { background: var(--iron-2); }
  .rest :global(svg) { color: var(--chalk-faint); }
  .check { display: flex; align-items: center; gap: 10px; min-height: 40px; }
  .rest-form { gap: 20px; }
  .note { display: flex; gap: 6px; align-items: flex-start; margin: 0; color: var(--chalk-dim); }
  .note :global(svg) { flex: none; margin-top: 1px; color: var(--chalk-faint); }
  .suggest { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0 8px; margin: 0; }
  .target { font-size: 1rem; font-weight: 600; color: var(--ink-yellow); }
  .sets { display: grid; gap: 2px; }
  /* Timed sets have a start button between the time and the tick. */
  .card.timed { --set-cols: 28px minmax(0, 1fr) 64px 42px 44px; }
  .cols { display: grid; grid-template-columns: var(--set-cols); gap: 6px; padding-bottom: 2px; }
  .cols span:nth-child(n + 2) { text-align: center; }
  .last { margin: 0; overflow-wrap: anywhere; }
  .warm-toggle {
    min-height: 40px; border: 1px dashed var(--line); border-radius: var(--r-sm);
    background: none; color: var(--chalk-dim); text-align: left; padding: 0 12px;
  }
  .foot { display: flex; gap: 8px; }
  .add { margin-left: -8px; padding: 0 8px; border-color: transparent; color: var(--chalk-dim); }
  .actions { display: grid; gap: 8px; }
  .actions .btn { justify-content: flex-start; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .btn:disabled { opacity: 0.4; }
</style>

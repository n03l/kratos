<script lang="ts">
  import ExercisePicker from '../lib/components/ExercisePicker.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import MuscleMap from '../lib/components/MuscleMap.svelte';
  import SetEditor from '../lib/components/SetEditor.svelte';
  import Sheet from '../lib/components/Sheet.svelte';
  import {
    addSavedExercise, addSavedSet, currentGym, db, deleteSession, exercise, gym, gymColor, historyByExercise,
    removeSavedExercise, removeSavedSet, updateSessionDetails, type SessionDetails,
  } from '../lib/store.svelte';
  import { duration, timeLabel, tonnes } from '../lib/format';
  import { volume } from '../lib/logic/training';
  import { dayOf, planOf } from '../lib/logic/plans';
  import { recordText, sessionRecords } from '../lib/logic/records';
  import { setsPerMuscle } from '../lib/logic/muscles';
  import { setText } from '../lib/format';
  import type { LoggedSet } from '../lib/model';
  import { navigate } from '../lib/router.svelte';

  let { id, saved = false }: { id: string; saved?: boolean } = $props();

  const s = $derived(db().sessions.find((x) => x.id === id));
  const items = $derived(s?.blocks.flatMap((b) => b.items) ?? []);
  const records = $derived(s ? sessionRecords(s, db().sessions, db().exercises, historyByExercise()) : []);
  const g = $derived(s ? gym(s.gymId) : undefined);
  const muscles = $derived(setsPerMuscle(items, exercise));

  const badge = (set: LoggedSet, sets: LoggedSet[]) => {
    if (set.type === 'warmup') return 'W';
    if (set.type === 'myo') return 'M';
    if (set.type === 'mini') return '+';
    if (set.type === 'drop') return 'D';
    return String(sets.filter((x) => x.type === 'working').indexOf(set) + 1);
  };

  let editMode = $state(false);

  // Set editor: which set, and where it is in the workout.
  let target = $state<{ set: LoggedSet; bi: number; ii: number } | null>(null);
  let editorOpen = $state(false);
  const targetItem = $derived(target && s ? s.blocks[target.bi]?.items[target.ii] : undefined);
  const targetEx = $derived(targetItem ? exercise(targetItem.exerciseId) : undefined);

  function editSet(set: LoggedSet, bi: number, ii: number) {
    target = { set, bi, ii };
    editorOpen = true;
  }

  function setTitle(set: LoggedSet, sets: LoggedSet[], name: string) {
    const kind = { warmup: 'Warmup set', working: `Set ${badge(set, sets)}`, myo: 'Activation set', mini: 'Mini-set', drop: 'Drop set' }[set.type];
    return `${kind} · ${name}`;
  }

  // Details: name, start, length, gym and notes.
  let detailsOpen = $state(false);
  let draft = $state<SessionDetails>({ name: '', start: '', durationMin: 0, gymId: '', notes: '' });
  let detailsError = $state('');

  /** "2026-10-28T07:30" in local time, for <input type="datetime-local">. */
  function localInput(iso: string) {
    const d = new Date(iso);
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  function openDetails() {
    if (!s) return;
    draft = { name: s.name, start: localInput(s.startedAt), durationMin: s.durationMin, gymId: s.gymId, notes: s.notes ?? '' };
    detailsError = '';
    detailsOpen = true;
  }

  function saveDetails() {
    if (!s) return;
    detailsError = updateSessionDetails(s, draft);
    if (!detailsError) detailsOpen = false;
  }

  let removing = $state<{ bi: number; ii: number; name: string; sets: number } | null>(null);
  let removeOpen = $state(false);
  let deleteOpen = $state(false);
  let picking = $state(false);

  function remove() {
    if (s && removing) removeSavedExercise(s, removing.bi, removing.ii);
    removeOpen = false;
  }

  function deleteWorkout() {
    deleteOpen = false;
    deleteSession(id);
    navigate('/history');
  }
</script>

{#if !s}
  <section class="page">
    <a class="back" href="#/history"><Icon name="back" size={20} /> History</a>
    <h1 class="title">Workout not found</h1>
    <p class="muted">It may have been deleted.</p>
  </section>
{:else}
  <section class="page">
    <div>
      <div class="top">
        {#if saved}
          <p class="saved"><Icon name="check" size={18} /> Workout saved</p>
        {:else}
          <a class="back" href="#/history"><Icon name="back" size={20} /> History</a>
        {/if}
        {#if editMode}
          <button class="btn sm primary" onclick={() => (editMode = false)}>Done</button>
        {:else}
          <button class="btn sm ghost" onclick={() => (editMode = true)}><Icon name="edit" size={18} /> Edit</button>
        {/if}
      </div>
      {#if planOf(s.name)}<p class="muted plan">{planOf(s.name)}</p>{/if}
      <h1 class="title">{dayOf(s.name)}</h1>
      <p class="muted where">
        <span class="gym-dot" style:background={gymColor(g)}></span>
        {new Date(s.startedAt).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })} at {timeLabel(s.startedAt)}, {g?.name ?? 'Unknown gym'}
      </p>
      {#if editMode}
        <button class="btn ghost block details" onclick={openDetails}><Icon name="edit" size={18} /> Edit name, date, gym and notes</button>
      {/if}
    </div>

    <dl class="stats">
      <div><dt>Time</dt><dd class="num">{duration(s.durationMin)}</dd></div>
      <div><dt>Lifted</dt><dd class="num">{tonnes(items.reduce((t, i) => t + volume(i.sets), 0))}</dd></div>
      <div><dt>Sets</dt><dd class="num">{items.flatMap((i) => i.sets).filter((x) => x.type !== 'warmup').length}</dd></div>
      <div><dt>Records</dt><dd class="num" class:gold={records.length > 0}>{records.length}</dd></div>
    </dl>

    {#if [...muscles.values()].some((n) => n > 0)}
      <section class="section">
        <h2 class="h2">Muscles worked</h2>
        <MuscleMap sets={muscles} />
      </section>
    {/if}

    {#if records.length}
      <section class="section">
        <h2 class="h2">New records</h2>
        <ul class="list records">
          {#each records as r (r.exerciseId)}
            {@const ex = exercise(r.exerciseId)}
            <li>
              <Icon name="trophy" size={20} />
              <span class="grow">
                <span class="h3">{ex?.name}</span>
                <span class="small muted">
                  {recordText(r, ex)}{ex?.gymSpecific ? ` at ${g?.name}` : ''}
                </span>
              </span>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="section">
      <h2 class="h2">Exercises</h2>
      {#if editMode}<p class="small muted hint">Tap a set to change or delete it.</p>{/if}
      {#each s.blocks as b, bi (b.id)}
        <div class="sblock" class:ss={b.items.length > 1}>
          {#each b.items as it, ii (it.exerciseId + ii)}
            {@const ex = exercise(it.exerciseId)}
            <article class="ex">
              <a class="h3 exname" href="#/exercises/{encodeURIComponent(it.exerciseId)}">{ex?.name ?? 'Deleted exercise'}</a>
              <ol class="sets">
                {#each it.sets as set (set.id)}
                  <li class={set.type}>
                    {#if editMode && ex}
                      <button class="set-btn" onclick={() => editSet(set, bi, ii)} aria-label="Edit {setTitle(set, it.sets, ex.name)}: {setText(set, ex)}">
                        <span class="b num">{badge(set, it.sets)}</span>
                        <span class="num">{setText(set, ex)}</span>
                        <Icon name="edit" size={16} />
                      </button>
                    {:else}
                      <span class="b num">{badge(set, it.sets)}</span>
                      <span class="num">{setText(set, ex)}</span>
                    {/if}
                  </li>
                {/each}
              </ol>
              {#if editMode}
                <div class="ex-actions">
                  {#if ex}<button class="btn sm ghost" onclick={() => addSavedSet(it)}><Icon name="plus" size={18} /> Add set</button>{/if}
                  <button class="btn sm ghost remove"
                    onclick={() => { removing = { bi, ii, name: ex?.name ?? 'this exercise', sets: it.sets.length }; removeOpen = true; }}>
                    <Icon name="trash" size={18} /> Remove
                  </button>
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {/each}
      {#if editMode}
        <button class="btn ghost block" onclick={() => (picking = true)}><Icon name="plus" /> Add exercise</button>
      {/if}
    </section>

    {#if s.notes}
      <section class="section">
        <h2 class="h2">Notes</h2>
        <p class="notes">{s.notes}</p>
      </section>
    {/if}

    {#if editMode}
      <button class="btn danger block" onclick={() => (deleteOpen = true)}><Icon name="trash" /> Delete workout</button>
    {:else if saved}
      <a class="btn primary block" href="#/">Done</a>
    {/if}
  </section>

  {#if targetItem && targetEx}
    <SetEditor bind:open={editorOpen} set={target?.set ?? null} item={targetItem} ex={targetEx} gym={g ?? currentGym()}
      title={target ? setTitle(target.set, targetItem.sets, targetEx.name) : targetEx.name}
      ondelete={(set) => { if (target) removeSavedSet(s, target.bi, target.ii, set.id); }} />
  {/if}

  <ExercisePicker bind:open={picking} onpick={(exerciseId) => addSavedExercise(s, exerciseId)} />

  <Sheet bind:open={detailsOpen} title="Workout details">
    <form class="stack" oninput={() => (detailsError = '')} onsubmit={(e) => { e.preventDefault(); saveDetails(); }}>
      <label class="field"><span>Name</span>
        <input autocomplete="off" class="input" maxlength="60" bind:value={draft.name} /></label>
      <div class="two">
        <label class="field"><span>Started</span>
          <input autocomplete="off" class="input" type="datetime-local" bind:value={draft.start} /></label>
        <label class="field"><span>Minutes</span>
          <input autocomplete="off" class="input num" type="number" inputmode="numeric" min="0" max="1440" bind:value={draft.durationMin} /></label>
      </div>
      <label class="field"><span>Gym</span>
        <select class="input" bind:value={draft.gymId}>
          {#each db().gyms as gy (gy.id)}<option value={gy.id}>{gy.name}</option>{/each}
        </select>
      </label>
      <label class="field"><span>Notes</span>
        <textarea class="input" maxlength="5000" bind:value={draft.notes}></textarea></label>
      {#if detailsError}<p class="error small" role="alert">{detailsError}</p>{/if}
      <button class="btn primary block">Save details</button>
    </form>
  </Sheet>

  <Sheet bind:open={removeOpen} title="Remove {removing?.name ?? 'exercise'}?">
    <div class="stack">
      <p class="muted">Its {removing?.sets} {removing?.sets === 1 ? 'set is' : 'sets are'} deleted from this workout.</p>
      <button class="btn danger block" onclick={remove}>Remove exercise</button>
      <button class="btn ghost block" onclick={() => (removeOpen = false)}>Keep it</button>
    </div>
  </Sheet>

  <Sheet bind:open={deleteOpen} title="Delete this workout?">
    <div class="stack">
      <p class="muted">{s.name} and its {items.flatMap((i) => i.sets).length} sets are deleted, with any records it set.</p>
      <button class="btn danger block" onclick={deleteWorkout}>Delete workout</button>
      <button class="btn ghost block" onclick={() => (deleteOpen = false)}>Keep it</button>
    </div>
  </Sheet>
{/if}

<style>
  .top { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; }
  .saved { display: flex; align-items: center; gap: 6px; margin: 0; color: var(--ink-green); font-weight: 600; }
  .plan { margin: 0 0 2px; }
  .where { display: flex; align-items: center; gap: 8px; margin: 6px 0 0; }
  .details { margin-top: 14px; white-space: normal; text-align: center; }
  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0; }
  .stats div { padding: 12px; border-radius: var(--r-md); background: var(--iron-1); }
  dt { font-size: 0.9375rem; color: var(--chalk-dim); }
  dd { margin: 0; font-size: 1.5rem; font-weight: 600; white-space: nowrap; }
  dd.gold { color: var(--ink-yellow); }
  .records li { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; }
  .records :global(svg) { flex: none; color: var(--plate-yellow); margin-top: 2px; }
  .grow { display: grid; min-width: 0; }
  .hint { margin: -4px 0 0; }
  .sblock { display: grid; gap: 8px; }
  .sblock.ss { padding-left: 12px; border-left: 3px solid var(--plate-blue); }
  .ex { padding: 14px 16px; border-radius: var(--r-md); background: var(--iron-1); }
  .exname { display: block; text-decoration: none; margin-bottom: 8px; overflow-wrap: anywhere; }
  .sets { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .sets li { display: flex; align-items: baseline; gap: 10px; font-size: 1.05rem; }
  .set-btn {
    display: flex; align-items: center; gap: 10px; width: calc(100% + 16px); min-height: 44px; margin: 0 -8px; padding: 0 8px;
    border: 0; border-radius: var(--r-sm); background: var(--iron-2); color: inherit; text-align: left; font-size: inherit;
  }
  .set-btn :global(svg) { margin-left: auto; color: var(--chalk-faint); }
  .b { width: 22px; color: var(--chalk-dim); font-weight: 700; }
  .warmup { color: var(--chalk-faint); }
  .myo .b, .mini .b { color: var(--ink-green); }
  .drop .b { color: var(--ink-blue); }
  .ex-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
  .remove { color: var(--ink-red); }
  .notes { margin: 0; white-space: pre-wrap; }
  .two { display: grid; grid-template-columns: minmax(0, 1fr) 96px; gap: 10px; }
  .two > * { min-width: 0; }
  .two .input { min-width: 0; padding: 0 10px; }
  .error { margin: 0; color: var(--ink-red); }
  @media (max-width: 400px) { dd { font-size: 1.2rem; } .stats div { padding: 10px; } }
</style>

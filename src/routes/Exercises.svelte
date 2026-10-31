<script lang="ts">
  import ExerciseTags from '../lib/components/ExerciseTags.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import Sheet from '../lib/components/Sheet.svelte';
  import { app, db, lastSets, restoreExercise, saveExercise, uid } from '../lib/store.svelte';
  import { sameName } from '../lib/logic/merge';
  import { navigate } from '../lib/router.svelte';
  import { amount, formatWeight } from '../lib/logic/training';
  import { byName, exerciseMeta, setText } from '../lib/format';
  import { MUSCLES, isGymSpecificEquipment, type Exercise, type Muscle } from '../lib/model';

  let q = $state('');
  let muscle = $state<Muscle | null>(null);
  let creating = $state(false);
  let showArchived = $state(false);
  let draft = $state<Exercise>(blank());

  function blank(): Exercise {
    return { id: '', name: '', muscles: [], equipment: 'barbell', gymSpecific: false };
  }

  const matching = $derived(
    db().exercises
      .filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()))
      .filter((e) => !muscle || e.muscles.includes(muscle))
      .sort(byName),
  );
  const list = $derived(matching.filter((e) => !e.archived));
  const archivedList = $derived(matching.filter((e) => e.archived));

  function topSet(e: Exercise) {
    const sets = lastSets(e, app.gymId)?.filter((s) => s.type !== 'warmup');
    if (!sets?.length) return null;
    const top = sets.reduce((a, b) => (b.weight > a.weight || (b.weight === a.weight && amount(b) > amount(a)) ? b : a));
    return setText(top, e).replace(' kg', '');
  }

  let createError = $state('');

  function create() {
    const name = draft.name.trim();
    if (!name) return;
    const same = db().exercises.find((e) => sameName(e.name, name));
    if (same?.archived) {
      // Creating an exercise you deleted earlier brings the old one back, with its history.
      restoreExercise(same.id);
      creating = false;
      draft = blank();
      navigate(`/exercises/${same.id}`);
      return;
    }
    if (same) {
      createError = `“${same.name}” already exists.`;
      return;
    }
    const e = { ...$state.snapshot(draft), name, id: uid() };
    saveExercise(e);
    creating = false;
    draft = blank();
    navigate(`/exercises/${e.id}`);
  }
</script>

<section class="page">
  <header class="page-head">
    <h1 class="title">Exercises</h1>
    <button class="btn sm" onclick={() => (creating = true)}><Icon name="plus" size={18} /> New exercise</button>
  </header>

  <div class="stack">
    <label class="search">
      <Icon name="search" size={20} />
      <span class="sr-only">Search exercises</span>
      <input autocomplete="off" class="input" type="search" placeholder="Search" bind:value={q} />
    </label>
    <div class="scroll-x" role="group" aria-label="Filter by muscle">
      <button class="chip" aria-pressed={muscle === null} onclick={() => (muscle = null)}>All</button>
      {#each MUSCLES as m (m)}
        <button class="chip cap" aria-pressed={muscle === m} onclick={() => (muscle = muscle === m ? null : m)}>{m}</button>
      {/each}
    </div>
  </div>

  <ul class="list">
    {#each list as e (e.id)}
      {@const top = topSet(e)}
      <li>
        <a class="list-link" href="#/exercises/{encodeURIComponent(e.id)}">
          <span class="grow">
            <span class="h3 name">{e.name}</span>
            <span class="small muted cap">{exerciseMeta(e)}</span>
          </span>
          {#if e.gymSpecific}<span class="per-gym" title="History kept per gym"><Icon name="pin" size={16} /></span>{/if}
          <span class="top num">{#if top}{top}{:else}<span class="faint">–</span>{/if}</span>
        </a>
      </li>
    {:else}
      <li class="muted empty">No exercise matches. Create it with New exercise.</li>
    {/each}
  </ul>
  {#if archivedList.length}
    <button class="btn ghost block" aria-expanded={showArchived} onclick={() => (showArchived = !showArchived)}>
      {showArchived ? 'Hide' : 'Show'} {archivedList.length} archived {archivedList.length === 1 ? 'exercise' : 'exercises'}
    </button>
    {#if showArchived}
      <ul class="list">
        {#each archivedList as e (e.id)}
          <li>
            <a class="list-link" href="#/exercises/{encodeURIComponent(e.id)}">
              <span class="grow">
                <span class="h3 name dim">{e.name}</span>
                <span class="small faint cap">{exerciseMeta(e)}</span>
              </span>
              <span class="small faint">Archived</span>
            </a>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
  <p class="small faint legend"><Icon name="pin" size={14} /> Machines and cables keep separate history at each gym. Weights show your last top set here.</p>
</section>

<Sheet bind:open={creating} title="New exercise">
  <form class="stack" onsubmit={(e) => { e.preventDefault(); create(); }}>
    <label class="field"><span>Name</span><input autocomplete="off" class="input" bind:value={draft.name} required maxlength="80" oninput={() => (createError = '')} /></label>
    <ExerciseTags equipment={draft.equipment} muscles={draft.muscles}
      onequipment={(eq) => { draft.equipment = eq; draft.gymSpecific = isGymSpecificEquipment(eq); }}
      onmuscles={(m) => (draft.muscles = m)} />
    <fieldset class="field">
      <legend class="small muted">Measured by</legend>
      <div class="seg">
        <button type="button" aria-pressed={draft.measure !== 'time'} onclick={() => (draft.measure = undefined)}>Reps</button>
        <button type="button" aria-pressed={draft.measure === 'time'} onclick={() => (draft.measure = 'time')}>Time held</button>
      </div>
    </fieldset>
    <label class="toggle">
      <input type="checkbox" bind:checked={draft.gymSpecific} />
      <span><span class="h3">Different at each gym</span><br /><span class="small muted">Keep history, records and setup notes per gym. On for machines and cables.</span></span>
    </label>
    {#if createError}<p class="small err" role="alert">{createError}</p>{/if}
    <button class="btn primary block" disabled={!draft.name.trim()}>Create exercise</button>
  </form>
</Sheet>

<style>
  .search { position: relative; display: block; }
  .search :global(svg) { position: absolute; left: 12px; top: 14px; color: var(--chalk-faint); }
  .search input { padding-left: 42px; }
  .cap { text-transform: capitalize; }
  .grow { flex: 1; display: grid; min-width: 0; }
  .name { overflow-wrap: anywhere; }
  .dim { color: var(--chalk-dim); }
  .per-gym { color: var(--chalk-faint); display: grid; }
  .top { min-width: 64px; text-align: right; font-size: 1rem; font-weight: 500; color: var(--chalk-dim); }
  .empty { padding: 20px 0; }
  .legend { display: flex; gap: 6px; align-items: center; margin: 0; }
  fieldset { border: 0; margin: 0; padding: 0; }
  legend { margin-bottom: 6px; }
  .toggle { display: flex; gap: 12px; align-items: flex-start; }
  .toggle input { margin-top: 2px; }
  .btn:disabled { opacity: 0.4; }
  .err { margin: 0; color: var(--ink-red); }
</style>

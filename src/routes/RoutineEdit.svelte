<script lang="ts">
  import ExercisePicker from '../lib/components/ExercisePicker.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import Sheet from '../lib/components/Sheet.svelte';
  import { db, exercise, setRoutineArchived, uid } from '../lib/store.svelte';
  import { navigate } from '../lib/router.svelte';
  import RestPicker from '../lib/components/RestPicker.svelte';
  import NumberField from '../lib/components/NumberField.svelte';
  import { cleanText } from '../lib/logic/limits';
  import { formatRest } from '../lib/logic/rest';
  import { buildExport } from '../lib/logic/merge';
  import { downloadJson, fileSlug } from '../lib/download';
  import { DEFAULT_DROP_PCT, type PlannedBlock, type PlannedExercise } from '../lib/model';
  import { defaultScheme } from '../lib/store.svelte';
  import { dropsText, seconds } from '../lib/format';

  let { id }: { id: string } = $props();

  const r = $derived(db().routines.find((x) => x.id === id));
  let picking = $state(false);
  let editing = $state<PlannedExercise | null>(null);
  let editOpen = $state(false);
  let deleting = $state(false);

  const letters = $derived.by(() => {
    let n = 0;
    return (r?.blocks ?? []).map((b) => (b.items.length > 1 ? String.fromCharCode(65 + n++) : ''));
  });

  function summary(p: PlannedExercise) {
    const s = p.scheme;
    const main = s.kind === 'straight'
      ? `${s.sets} × ${s.repsMin}–${s.repsMax}${dropsText(s)}`
      : `${s.sets} × ${seconds(s.secMin)}–${seconds(s.secMax)}`;
    const prog = p.progression.kind === 'none' ? ''
      : `, ${p.progression.kind === 'double' ? 'double progression' : 'linear'}${p.progression.increment ? ` +${p.progression.increment} kg` : ''}`;
    return `${main}, rest ${formatRest(p.restSec)}${p.warmup === 'auto' ? ', warmups' : ''}${prog}`;
  }

  const roundRest = (b: PlannedBlock) => b.roundRestSec ?? Math.max(...b.items.map((i) => i.restSec));
  let ssBlock = $state<PlannedBlock | null>(null);
  let ssOpen = $state(false);
  let ssRound = $state(0);
  let ssBetween = $state(0);

  function openSuperset(b: PlannedBlock) {
    ssBlock = b;
    ssRound = roundRest(b);
    ssBetween = b.transitionSec ?? 0;
    ssOpen = true;
  }

  // A new exercise opens its settings straight away, so sets, set style and rest are where you'd look for them.
  function add(exerciseId: string) {
    if (!r) return;
    r.blocks.push({
      id: uid(),
      items: [{
        exerciseId, warmup: 'none', restSec: exercise(exerciseId)?.restSec ?? db().settings.defaultRestSec,
        scheme: defaultScheme(exercise(exerciseId)!),
        progression: { kind: 'double', increment: 0 },
      }],
    });
    editing = r.blocks[r.blocks.length - 1].items[0];
    editOpen = true;
  }

  function move(i: number, dir: -1 | 1) {
    const b = r!.blocks;
    const j = i + dir;
    if (j < 0 || j >= b.length) return;
    [b[i], b[j]] = [b[j], b[i]];
  }

  function link(i: number) {
    const b = r!.blocks;
    b[i].items.push(...b[i + 1].items);
    b.splice(i + 1, 1);
  }

  function unlink(bi: number, ii: number) {
    const b = r!.blocks;
    const [it] = b[bi].items.splice(ii, 1);
    b.splice(bi + 1, 0, { id: uid(), items: [it] });
  }

  // One menu per exercise: move, superset and remove.
  let menuAt = $state<{ bi: number; ii: number } | null>(null);
  let menuOpen = $state(false);
  const menuBlock = $derived(menuAt && r ? r.blocks[menuAt.bi] : undefined);

  function act(fn: (bi: number, ii: number) => void) {
    if (menuAt) fn(menuAt.bi, menuAt.ii);
    menuOpen = false;
  }

  function remove(bi: number, ii: number) {
    const b = r!.blocks;
    b[bi].items.splice(ii, 1);
    if (!b[bi].items.length) b.splice(bi, 1);
  }

  function setDrops(n: number) {
    if (editing?.scheme.kind !== 'straight') return;
    const s = editing.scheme;
    if (n === 0) {
      delete s.drops;
      delete s.dropPct;
      delete s.dropRestSec;
      return;
    }
    s.drops = n;
    s.dropPct ??= DEFAULT_DROP_PCT;
    s.dropRestSec ??= 0;
  }

  function setProgression(kind: 'double' | 'linear' | 'none') {
    if (!editing) return;
    editing.progression = kind === 'none' ? { kind } : { kind, increment: editing.progression.kind === 'none' ? 0 : editing.progression.increment };
  }

  function setIncrement(value: number) {
    if (!editing || editing.progression.kind === 'none') return;
    editing.progression.increment = Number.isFinite(value) && value > 0 ? Math.min(value, 100) : 0;
  }
</script>

{#if !r}
  <section class="page">
    <a class="back" href="#/routines"><Icon name="back" size={20} /> Routines</a>
    <h1 class="title">Routine not found</h1>
  </section>
{:else}
  <section class="page">
    <div class="stack">
      <a class="back" href="#/routines"><Icon name="back" size={20} /> Routines</a>
      <label class="sr-only" for="rname">Routine name</label>
      <input autocomplete="off" id="rname" class="title rname" value={r.name} maxlength="60"
        onchange={(e) => { r.name = cleanText(e.currentTarget.value, 60, r.name); e.currentTarget.value = r.name; }} />
    </div>

    {#if r.archived}
      <div class="archived" role="status">
        <p><strong>Archived.</strong> Hidden from Today and the routine list. Its workouts stay in your history.</p>
        <button class="btn sm" onclick={() => setRoutineArchived(r!.id, false)}>Restore routine</button>
      </div>
    {/if}

    <ol class="blocks">
      {#each r.blocks as b, bi (b.id)}
        <li class="rblock" class:ss={b.items.length > 1}>
          {#if b.items.length > 1}
            <div class="ss-head">
              <span class="small"><Icon name="link" size={16} /> Superset {letters[bi]}</span>
              <button class="ss-rest small num" onclick={() => openSuperset(b)} aria-label="Superset {letters[bi]} rest. Change">
                <Icon name="timer" size={16} />{b.transitionSec ? `${formatRest(b.transitionSec)} between, ` : ''}{formatRest(roundRest(b))} after round
              </button>
            </div>
          {/if}
          {#each b.items as p, ii (p.exerciseId + ii)}
            <div class="item">
              <button class="grow plain" onclick={() => { editing = p; editOpen = true; }}>
                <span class="h3 name">{#if letters[bi]}<span class="tag num">{letters[bi]}{ii + 1}</span>{/if}{exercise(p.exerciseId)?.name ?? 'Unknown'}</span>
                <span class="small muted">{summary(p)}</span>
              </button>
              <button class="icon-btn" onclick={() => { menuAt = { bi, ii }; menuOpen = true; }}
                aria-label="Options for {exercise(p.exerciseId)?.name}"><Icon name="menu" /></button>
            </div>
          {/each}
        </li>
        {#if bi < r.blocks.length - 1}
          <li class="join">
            <button class="join-btn small" onclick={() => link(bi)}
              aria-label="Superset {exercise(b.items[b.items.length - 1].exerciseId)?.name} with {exercise(r.blocks[bi + 1].items[0].exerciseId)?.name}">
              <Icon name="link" size={16} /> Superset
            </button>
          </li>
        {/if}
      {:else}
        <li class="surface pad empty">
          <p class="h3">No exercises yet</p>
          <p class="small muted">Add exercises, then set their sets and reps and link neighbours into supersets.</p>
        </li>
      {/each}
    </ol>

    {#if r.blocks.length}
      <p class="small muted hint">Tap an exercise to change its sets and reps, drop sets, rest, warmups and progression.</p>
    {/if}
    <button class="btn block" onclick={() => (picking = true)}><Icon name="plus" /> Add exercise</button>

    <ul class="list">
      <li>
        <button class="list-link" disabled={!r.blocks.length}
          onclick={() => downloadJson(`kratos-routine-${fileSlug(r!.name)}.json`, buildExport($state.snapshot(db()), { routineIds: [r!.id] }))}>
          <Icon name="download" /><span class="grow"><span class="h3">Export routine</span><span class="small muted">Save it to a file to share</span></span>
        </button>
      </li>
      {#if !r.archived}
        <li>
          <button class="list-link" onclick={() => { setRoutineArchived(r!.id, true); navigate('/routines'); }}>
            <Icon name="archive" /><span class="grow"><span class="h3">Archive routine</span><span class="small muted">Hide it from Today and keep its history</span></span>
          </button>
        </li>
      {/if}
      <li>
        <button class="list-link destructive" onclick={() => (deleting = true)}>
          <Icon name="trash" /><span class="grow"><span class="h3">Delete routine</span></span>
        </button>
      </li>
    </ul>
  </section>

  <ExercisePicker bind:open={picking} onpick={add} />

  <Sheet bind:open={menuOpen} title={menuAt && menuBlock ? (exercise(menuBlock.items[menuAt.ii]?.exerciseId ?? '')?.name ?? 'Exercise') : 'Exercise'}>
    {#if menuAt && menuBlock}
      {@const last = menuAt.bi === r.blocks.length - 1}
      <div class="actions">
        {#if menuBlock.items.length > 1}
          <button class="btn ghost block" onclick={() => act(unlink)}><Icon name="unlink" /> Remove from superset</button>
        {/if}
        {#if !last}
          <button class="btn ghost block" onclick={() => act((bi) => link(bi))}>
            <Icon name="link" /> {menuBlock.items.length > 1 ? 'Add next exercise to superset' : 'Superset with next exercise'}
          </button>
        {/if}
        <div class="two">
          <button class="btn ghost" disabled={menuAt.bi === 0} onclick={() => act((bi) => move(bi, -1))}><Icon name="up" /> Move up</button>
          <button class="btn ghost" disabled={last} onclick={() => act((bi) => move(bi, 1))}><Icon name="down" /> Move down</button>
        </div>
        <button class="btn danger block" onclick={() => act(remove)}><Icon name="trash" /> Remove exercise</button>
      </div>
    {/if}
  </Sheet>

  <Sheet bind:open={editOpen} title={editing ? (exercise(editing.exerciseId)?.name ?? 'Exercise') : 'Exercise'}>
    {#if editing}
      {@const e = editing}
      <form class="stack form" onsubmit={(ev) => { ev.preventDefault(); editOpen = false; }}>
        {#if e.scheme.kind === 'timed'}
          {@const t = e.scheme}
          <p class="small muted">Timed holds. The set timer counts down from the target; with double progression, holds get 5 s longer until every set reaches the top, then weight goes up.</p>
          <div class="grid4">
            <NumberField label="Sets" value={t.sets} min={1} max={10} onvalue={(v) => (t.sets = v)} />
            <NumberField label="Min seconds" value={t.secMin} min={1} max={3600} step={5}
              onvalue={(v) => { t.secMin = v; t.secMax = Math.max(t.secMax, v); }} />
            <NumberField label="Max seconds" value={t.secMax} min={1} max={3600} step={5}
              onvalue={(v) => { t.secMax = v; t.secMin = Math.min(t.secMin, v); }} />
          </div>
        {:else}
          {@const t = e.scheme}
          <div class="grid4">
            <NumberField label="Sets" value={t.sets} min={1} max={10} onvalue={(v) => (t.sets = v)} />
            <NumberField label="Min reps" value={t.repsMin} min={1} max={100}
              onvalue={(v) => { t.repsMin = v; t.repsMax = Math.max(t.repsMax, v); }} />
            <NumberField label="Max reps" value={t.repsMax} min={1} max={100}
              onvalue={(v) => { t.repsMax = v; t.repsMin = Math.min(t.repsMin, v); }} />
          </div>
          <fieldset class="field">
            <legend class="small muted">Drop sets after the last set</legend>
            <div class="seg">
              {#each [0, 1, 2, 3] as n (n)}
                <button type="button" aria-pressed={(e.scheme.drops ?? 0) === n} onclick={() => setDrops(n)}>{n === 0 ? 'None' : n}</button>
              {/each}
            </div>
          </fieldset>
          {#if e.scheme.drops}
          {@const t = e.scheme}
            <p class="small muted">Each drop is lighter than the set before, rounded to the equipment's step. Go close to failure on each.</p>
            <div class="grid4">
              <NumberField label="Weight drop (%)" value={t.dropPct ?? DEFAULT_DROP_PCT} min={5} max={60} step={5}
                onvalue={(v) => (t.dropPct = v)} />
            </div>
            <RestPicker bind:value={e.scheme.dropRestSec!} label="Rest before each drop" presets={[0, 5, 10, 15, 20, 30]} step={5} />
          {/if}
        {/if}

        <RestPicker bind:value={e.restSec} label="Rest after each set" />

        <fieldset class="field">
          <legend class="small muted">Warmup sets</legend>
          <div class="seg">
            <button type="button" aria-pressed={e.warmup === 'auto'} onclick={() => (e.warmup = 'auto')}>Ramp up automatically</button>
            <button type="button" aria-pressed={e.warmup === 'none'} onclick={() => (e.warmup = 'none')}>None</button>
          </div>
        </fieldset>

        <fieldset class="field">
          <legend class="small muted">Progression</legend>
          <div class="seg">
            <button type="button" aria-pressed={e.progression.kind === 'double'} onclick={() => setProgression('double')}>Double</button>
            <button type="button" aria-pressed={e.progression.kind === 'linear'} onclick={() => setProgression('linear')}>Linear</button>
            <button type="button" aria-pressed={e.progression.kind === 'none'} onclick={() => setProgression('none')}>None</button>
          </div>
          <p class="small faint">
            {#if e.progression.kind === 'double'}Add reps until every set reaches the top of the range, then add weight.
            {:else if e.progression.kind === 'linear'}Add weight whenever every set reaches the bottom of the range.
            {:else}Repeat the last weight and reps.{/if}
          </p>
          {#if e.progression.kind !== 'none'}
            <label class="field inc"><span>Add (kg)</span>
              <input autocomplete="off" class="input num" type="number" inputmode="decimal" min="0" max="100" step="0.5" placeholder="Auto"
                value={e.progression.increment || ''} onchange={(ev) => setIncrement(ev.currentTarget.valueAsNumber)} /></label>
            <p class="small faint">Leave empty to add the smallest step available: plates, dumbbells or the machine at each gym.</p>
          {/if}
        </fieldset>

        <button class="btn primary block">Save</button>
      </form>
    {/if}
  </Sheet>

  <Sheet bind:open={ssOpen} title="Superset rest">
    <form class="stack form" onsubmit={(ev) => {
      ev.preventDefault();
      if (ssBlock) { ssBlock.roundRestSec = ssRound; ssBlock.transitionSec = ssBetween; }
      ssOpen = false;
    }}>
      <RestPicker bind:value={ssRound} label="After each round" />
      <RestPicker bind:value={ssBetween} label="Between exercises" presets={[0, 10, 15, 30, 45, 60]} step={5} />
      <button class="btn primary block">Save rest</button>
    </form>
  </Sheet>

  <Sheet bind:open={deleting} title="Delete {r.name}?">
    <div class="stack">
      <p class="muted">Past workouts stay in your history.{r.archived ? '' : ' To hide it but keep it, archive it instead.'}</p>
      <button class="btn danger block" onclick={() => {
        db().routines.splice(db().routines.findIndex((x) => x.id === r.id), 1);
        deleting = false;
        navigate('/routines');
      }}>Delete routine</button>
    </div>
  </Sheet>
{/if}

<style>
  .rname { width: 100%; padding: 0; border: 0; background: none; }
  .rname:focus { outline: none; box-shadow: 0 2px 0 var(--chalk-dim); }
  .blocks { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
  .join { display: flex; justify-content: center; }
  .join-btn {
    display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 12px; border: 0;
    border-radius: 16px; background: none; color: var(--chalk-faint);
  }
  .join-btn:hover, .join-btn:focus-visible { background: var(--iron-1); color: var(--ink-blue); }
  .hint { margin: -6px 0 0; }
  .rblock { display: grid; gap: 4px; padding: 6px 4px 6px 14px; border-radius: var(--r-lg); background: var(--iron-1); }
  .rblock.ss { box-shadow: inset 3px 0 0 var(--plate-blue); }
  .ss-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 4px 4px 0 0; color: var(--ink-blue); }
  .ss-head > span { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
  .ss-rest {
    display: inline-flex; align-items: center; gap: 6px; min-height: 32px; padding: 0 8px; border: 0;
    border-radius: var(--r-sm); background: none;
  }
  .ss-rest { color: var(--ink-blue); }
  .actions { display: grid; gap: 8px; }
  .actions .btn { justify-content: flex-start; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .btn:disabled { opacity: 0.4; }
  .ss-rest:hover { background: var(--iron-2); }
  .item { display: flex; align-items: center; gap: 2px; }
  .grow { flex: 1; min-width: 0; display: grid; gap: 2px; padding: 8px 0; }
  .plain { border: 0; background: none; text-align: left; }
  .name { display: flex; align-items: center; gap: 8px; overflow-wrap: anywhere; }
  .tag {
    flex: none; padding: 1px 6px; border-radius: 6px; font-size: 0.9rem;
    background: color-mix(in srgb, var(--plate-blue) 25%, transparent); color: var(--ink-blue);
  }
  .icon-btn:disabled { opacity: 0.3; }
  .empty p { margin: 0; }
  .list-link:disabled { opacity: 0.4; }
  .archived {
    display: grid; gap: 10px; justify-items: start; padding: 12px 14px; border-radius: var(--r-md);
    background: var(--iron-1); box-shadow: inset 3px 0 0 var(--chalk-faint);
  }
  .archived p { margin: 0; }
  .form { gap: 16px; }
  .grid4 { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
  fieldset { border: 0; margin: 0; padding: 0; }
  legend { margin-bottom: 6px; }
  .inc { max-width: 140px; margin-top: 4px; }
  .seg button { white-space: normal; line-height: 1.15; }
</style>

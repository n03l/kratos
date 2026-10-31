<script lang="ts">
  import { adjustRest, app, db, exercise, gym, lastSets, removeSet, shrinkRest, skipRest } from '../store.svelte';
  import { upNext } from '../logic/rest';
  import { setText } from '../format';
  import type { LoggedSet } from '../model';
  import { buzz } from '../sound';
  import Icon from './Icon.svelte';
  import SetEditor from './SetEditor.svelte';

  const ms = $derived(app.rest ? Math.max(0, app.rest.endsAt - app.now) : 0);
  const left = $derived(Math.ceil(ms / 1000));
  const frac = $derived(app.rest ? Math.min(1, ms / (app.rest.total * 1000)) : 0);
  const clock = $derived(`${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`);
  const final = $derived(app.rest !== null && left > 0 && left <= 3);
  const over = $derived(app.rest !== null && left === 0);
  const ten = $derived(app.rest !== null && app.rest.total >= 20 && left === 10);

  /** The set after this rest, for the "Up next" panel. */
  const next = $derived.by(() => {
    const n = app.active ? upNext(app.active, app.upNextFrom) : null;
    const item = n && app.active!.blocks[n.blockIndex].items[n.itemIndex];
    const ex = item && exercise(item.exerciseId);
    if (!n || !item || !ex) return null;
    return { name: ex.name, target: setText(n.set, ex), kind: setKind(n.set, item.sets), set: n.set, item, ex };
  });

  /** "9 of 22 sets done · exercise 2 of 5", the exercise being the next one. */
  const progress = $derived.by(() => {
    const items = app.active?.blocks.flatMap((b) => b.items) ?? [];
    const sets = items.flatMap((i) => i.sets);
    if (!sets.length) return '';
    const done = `${sets.filter((x) => x.done).length} of ${sets.length} sets done`;
    const k = next ? items.indexOf(next.item) + 1 : 0;
    return k ? `${done} · exercise ${k} of ${items.length}` : done;
  });

  // Change the next set without leaving the timer.
  let editorOpen = $state(false);
  let editing = $state<NonNullable<typeof next> | null>(null);
  const editGym = $derived(gym(app.active?.gymId ?? app.gymId));
  /** The same set from last time: same type, same position. */
  function previous(e: NonNullable<typeof next>) {
    const n = e.item.sets.filter((x) => x.type === e.set.type).indexOf(e.set);
    return lastSets(e.ex, app.active?.gymId ?? app.gymId)?.filter((x) => x.type === e.set.type)[n];
  }

  function setKind(set: LoggedSet, sets: LoggedSet[]): string {
    if (set.type === 'working') {
      const working = sets.filter((x) => x.type === 'working');
      return `Set ${working.indexOf(set) + 1} of ${working.length}`;
    }
    return { warmup: 'Warmup set', myo: 'Activation set', mini: 'Mini-set', drop: 'Drop set' }[set.type];
  }

  let dlg = $state<HTMLDialogElement>();

  // Vibration for the 10 s mark, the last 3 seconds and zero; the beeps are scheduled ahead by the store.
  // Only for seconds actually seen counting down, so a rest restored after it ended stays quiet.
  let cued = { endsAt: 0, sec: -1 };
  let countingFor = 0;
  $effect(() => {
    const r = app.rest;
    if (!r) return;
    if (left > 0) countingFor = r.endsAt;
    if (countingFor !== r.endsAt || (cued.endsAt === r.endsAt && cued.sec === left)) return;
    cued = { endsAt: r.endsAt, sec: left };
    if (!db().settings.vibrate) return;
    if (ten) buzz([80, 80, 80]);
    else if (left >= 1 && left <= 3) buzz(60);
    else if (left === 0) buzz([250, 120, 250]);
  });

  $effect(() => {
    if (!dlg) return;
    if (app.restFull && app.rest && !dlg.open) dlg.showModal();
    if ((!app.restFull || !app.rest) && dlg.open) dlg.close();
  });

  const R = 120;
  const C = 2 * Math.PI * R;
</script>

{#if app.rest}
  <div class="rest" class:over class:final role="timer" aria-label="Rest timer">
    <div class="track" aria-hidden="true"><div class="fill" style:transform="scaleX({frac})"></div></div>
    <div class="body">
      <button class="info" onclick={() => (app.restFull = true)} aria-label="Open countdown, {left} seconds left">
        <span class="clock num">{over ? 'Go' : clock}</span>
        <span class="caption">{over ? 'Rest over' : 'Rest'}</span>
      </button>
      <button class="btn sm ghost num" onclick={() => adjustRest(-15)} aria-label="15 seconds less">−15</button>
      <button class="btn sm ghost num" onclick={() => adjustRest(15)} aria-label="15 seconds more">+15</button>
      <button class="btn sm go skip" onclick={skipRest}>{over ? 'Dismiss' : 'Skip'}</button>
    </div>
    <p class="label">
      {#if next}Next: {next.name} <strong class="num">{next.target}</strong>{:else}{over ? 'Rest over' : app.rest.label}{/if}
    </p>
  </div>

  <dialog bind:this={dlg} class="full" onclose={shrinkRest} aria-label="Rest countdown">
    <div class="full-body" class:over class:final class:ten>
      <button class="icon-btn close" onclick={shrinkRest} aria-label="Shrink countdown"><Icon name="close" /></button>
      {#if next}
        <button class="next" onclick={() => { editing = next; editorOpen = true; }}
          aria-label="Up next: {next.kind}, {next.name}, {next.target}. Change">
          <span class="next-kind">{over ? 'Rest over · ' : ''}Up next · {next.kind}</span>
          <span class="next-name">{next.name}</span>
          <span class="next-target num">{next.target} <Icon name="edit" size={18} /></span>
        </button>
      {:else}
        <p class="flabel">{over ? 'Rest over' : app.rest.label}</p>
      {/if}
      <div class="ring">
        <svg viewBox="0 0 280 280" aria-hidden="true">
          <circle cx="140" cy="140" r={R} class="ring-track" />
          <circle cx="140" cy="140" r={R} class="ring-fill" stroke-dasharray={C} stroke-dashoffset={C * (1 - frac)} />
        </svg>
        <span class="big num" aria-live={final || over ? 'assertive' : 'off'}>{over ? 'Go' : clock}</span>
      </div>
      <div class="full-actions">
        <button class="btn ghost num" onclick={() => adjustRest(-15)}>−15 s</button>
        <button class="btn ghost num" onclick={() => adjustRest(15)}>+15 s</button>
      </div>
      <button class="btn go block" onclick={skipRest}>{over ? 'Start next set' : 'Skip rest'}</button>
      {#if progress}<p class="progress num">{progress}</p>{/if}
    </div>
  </dialog>

  {#if editing && editGym}
    {@const e = editing}
    <SetEditor bind:open={editorOpen} set={e.set} item={e.item} ex={e.ex} gym={editGym} title="{e.kind} · {e.name}"
      previous={previous(e)} ondelete={(set) => removeSet(e.item, set.id)} />
  {/if}
{/if}

<style>
  .rest {
    position: fixed;
    left: 50%;
    bottom: calc(var(--nav-h) + var(--safe-b) + 8px);
    z-index: 20;
    width: min(560px, calc(100% - 16px));
    transform: translateX(-50%);
    overflow: hidden;
    border: 1px solid var(--line);
    border-radius: var(--r-md);
    background: var(--iron-2);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.45);
  }
  .track { height: 3px; background: var(--iron-3); }
  .fill { height: 100%; background: var(--chalk); transform-origin: left; transition: transform 250ms linear; }
  .final .fill { background: var(--plate-yellow); }
  .over .fill { background: var(--plate-green); }
  .body { display: flex; align-items: center; gap: 6px; padding: 8px 10px; }
  .info {
    flex: 1; min-width: 0; display: grid; line-height: 1.1; padding: 0; border: 0; background: none; text-align: left;
  }
  .clock { font-size: 1.75rem; font-weight: 700; }
  .caption { font-size: 0.8125rem; color: var(--chalk-dim); }
  .skip { min-width: 76px; }
  .final .clock { color: var(--ink-yellow); }
  .over .clock { color: var(--ink-green); }
  .label {
    margin: -4px 0 0; padding: 0 12px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    font-size: 0.9375rem; color: var(--chalk-dim);
  }
  .label strong { color: var(--chalk); font-weight: 600; }

  .full {
    width: 100%; max-width: 100%; height: 100%; max-height: 100%; margin: 0; padding: 0; border: 0;
    background: var(--iron-0); color: var(--chalk);
  }
  .full::backdrop { background: var(--iron-0); }
  .full-body {
    position: relative; display: grid; justify-items: center; align-content: center; gap: 20px;
    min-height: 100%; max-width: 420px; margin: 0 auto;
    padding: calc(24px + env(safe-area-inset-top, 0px)) 24px calc(24px + var(--safe-b));
  }
  .close { position: absolute; top: calc(12px + env(safe-area-inset-top, 0px)); right: 12px; }
  .flabel { margin: 0 40px; text-align: center; font-size: 1.25rem; color: var(--chalk-dim); }
  .ring { --ring: min(80vw, 320px, 40dvh); position: relative; width: var(--ring); aspect-ratio: 1; display: grid; place-items: center; }
  .ring svg { position: absolute; inset: 0; transform: rotate(-90deg); }
  .ring-track { fill: none; stroke: var(--iron-2); stroke-width: 10; }
  .ring-fill { fill: none; stroke: var(--chalk); stroke-width: 10; stroke-linecap: round; transition: stroke-dashoffset 250ms linear; }
  .final .ring-fill { stroke: var(--plate-yellow); }
  .over .ring-fill { stroke: var(--plate-green); }
  .big { font-size: calc(var(--ring) * 0.27); font-weight: 700; line-height: 1; }
  .final .big { color: var(--ink-yellow); animation: tick 1s steps(1) infinite; }
  .over .big { color: var(--ink-green); }
  .ten .big { animation: tick 1s steps(1); }
  @keyframes tick { 0% { transform: scale(1.08); } 30% { transform: scale(1); } }
  .next {
    display: grid; justify-items: center; gap: 2px; width: 100%; padding: 10px 16px; border: 0; border-radius: var(--r-md);
    background: none; color: inherit; text-align: center;
  }
  .next:hover, .next:active { background: var(--iron-1); }
  .next-target :global(svg) { color: var(--chalk-faint); vertical-align: -1px; }
  .next-kind { font-size: 1rem; color: var(--chalk-dim); }
  .next-name { font-size: 1.25rem; font-weight: 600; line-height: 1.2; overflow-wrap: anywhere; }
  .next-target { font-size: 1.75rem; font-weight: 700; line-height: 1.15; }
  .progress { margin: 0; color: var(--chalk-dim); text-align: center; }
  .full-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }

  @media (min-width: 900px) {
    .rest { bottom: 16px; left: calc(50% + 120px); width: min(560px, calc(100% - 272px)); }
  }
</style>

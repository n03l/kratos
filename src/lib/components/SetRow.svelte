<script lang="ts">
  import type { LoggedSet } from '../model';
  import { formatWeight, stepValue } from '../logic/training';
  import { clock, seconds } from '../format';
  import { buzz } from '../sound';
  import Icon from './Icon.svelte';
  import { app, db, updateSet } from '../store.svelte';

  let {
    set, badge, step, timed = false, bodyweight = false, ondone, onedit, ontimer,
  }: {
    set: LoggedSet;
    badge: string;
    /** Weight step for the − and + buttons, from the gym's plates or the machine's stack. */
    step: number;
    /** Measured in seconds held instead of reps, with a set timer. */
    timed?: boolean;
    /** Weight is added weight; empty means bodyweight only. */
    bodyweight?: boolean;
    ondone: () => void;
    /** Open the set editor. */
    onedit: () => void;
    ontimer?: () => void;
  } = $props();

  const kindLabel: Record<LoggedSet['type'], string> = {
    warmup: 'Warmup set', working: 'Set', myo: 'Myo-rep activation set', mini: 'Mini-set', drop: 'Drop set',
  };
  const name = $derived(`${kindLabel[set.type]} ${badge}`);

  // Set timer: counts down from the target, then up as overtime; a plain stopwatch without a target.
  const running = $derived(app.setTimer?.setId === set.id ? app.setTimer : null);
  const elapsed = $derived(running ? Math.max(0, Math.floor((app.now - running.startedAt) / 1000)) : 0);
  const left = $derived(running ? running.targetSec - elapsed : 0);
  const mmss = (sec: number) => clock(sec * 1000);
  const display = $derived(
    !running ? '' : running.targetSec === 0 ? mmss(elapsed) : left > 0 ? mmss(left) : `+${mmss(-left)}`,
  );

  // Vibration for the last seconds; the beeps are scheduled ahead by the store.
  let cued = -1;
  $effect(() => {
    if (!running || running.targetSec === 0 || left === cued || left < 0 || left > 3) return;
    cued = left;
    if (db().settings.vibrate) buzz(left === 0 ? [250, 120, 250] : 60);
  });
</script>

<div class="row {set.type}" id="set-{set.id}" class:done={set.done} class:running={!!running}>
  <button class="badge num" onclick={onedit} aria-label="Edit {name.toLowerCase()}">{badge}</button>
  <div class="stepper">
    {#if !set.done}
      <button class="step" onclick={() => updateSet(set, 'weight', stepValue(set.weight, step, -1))} disabled={set.weight <= 0}
        aria-label="{name}: {formatWeight(step)} kg less"><Icon name="minus" size={18} /></button>
    {/if}
    <button class="value num" class:empty={!set.weight} onclick={onedit}
      aria-label="{name}, {set.weight ? `${bodyweight ? 'plus ' : ''}${formatWeight(set.weight)} kg` : bodyweight ? 'bodyweight' : 'no weight'}. Edit">
      {set.weight ? `${bodyweight ? '+' : ''}${formatWeight(set.weight)}` : bodyweight ? 'BW' : '–'}
    </button>
    {#if !set.done}
      <button class="step" onclick={() => updateSet(set, 'weight', stepValue(set.weight, step, 1))}
        aria-label="{name}: {formatWeight(step)} kg more"><Icon name="plus" size={18} /></button>
    {/if}
  </div>
  {#if timed}
    {#if running}
      <output class="num clock" class:over={running.targetSec > 0 && left <= 0} class:final={left > 0 && left <= 3}
        aria-live="off">{display}</output>
    {:else}
      <button class="cell num" class:empty={!set.durationSec} onclick={onedit}
        aria-label="{name}, {set.durationSec ? seconds(set.durationSec) : 'no time'}. Edit">
        {set.durationSec ? mmss(set.durationSec) : '0:00'}
      </button>
    {/if}
    <button class="timer" class:on={!!running} onclick={ontimer} disabled={set.done && !running}
      aria-label="{running ? 'Stop' : 'Start'} timer for {name.toLowerCase()}">
      <Icon name={running ? 'stop' : 'play'} size={18} />
    </button>
  {:else}
    <div class="stepper">
      {#if !set.done}
        <button class="step" onclick={() => updateSet(set, 'reps', stepValue(set.reps, 1, -1))} disabled={set.reps <= 0}
          aria-label="{name}: one rep less"><Icon name="minus" size={18} /></button>
      {/if}
      <button class="value num" onclick={onedit} aria-label="{name}, {set.reps} reps. Edit">{set.reps}</button>
      {#if !set.done}
        <button class="step" onclick={() => updateSet(set, 'reps', stepValue(set.reps, 1, 1))}
          aria-label="{name}: one rep more"><Icon name="plus" size={18} /></button>
      {/if}
    </div>
  {/if}
  <button class="tick" aria-pressed={set.done} onclick={ondone} aria-label="{set.done ? 'Undo' : 'Log'} {name.toLowerCase()}">
    <Icon name="check" size={20} />
  </button>
</div>

<style>
  .row {
    display: grid;
    grid-template-columns: var(--set-cols);
    align-items: center;
    gap: 6px;
    min-height: 52px;
    padding: 2px 6px;
    margin: 0 -6px;
    border-radius: var(--r-sm);
    transition: background-color 160ms;
  }
  .row.running { background: color-mix(in srgb, var(--plate-yellow) 10%, transparent); }

  .badge {
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--iron-2);
    line-height: 1;
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--chalk);
  }
  .warmup .badge { background: transparent; box-shadow: inset 0 0 0 1.5px var(--iron-3); color: var(--chalk-faint); font-weight: 600; }
  .myo .badge, .mini .badge { background: color-mix(in srgb, var(--plate-green) 22%, transparent); color: var(--ink-green); }
  .drop .badge { background: color-mix(in srgb, var(--plate-blue) 22%, transparent); color: var(--ink-blue); }
  .done .badge { background: color-mix(in srgb, var(--go) 24%, transparent); box-shadow: none; color: var(--ink-green); }

  /* − value +, the value opens the set editor for typing, the set type and plates. */
  .stepper {
    display: grid;
    grid-template-columns: 32px minmax(0, 1fr) 32px;
    align-items: center;
    height: 44px;
    border-radius: 10px;
    background: var(--iron-2);
  }
  .done .stepper { grid-template-columns: minmax(0, 1fr); background: transparent; }
  .step {
    display: grid;
    place-items: center;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    color: var(--chalk-dim);
  }
  .step:active { color: var(--chalk); }
  .step:disabled { opacity: 0.3; }
  .value, .cell, .clock {
    display: grid;
    place-items: center;
    min-width: 0;
    height: 100%;
    padding: 0 2px;
    border: 0;
    background: none;
    text-align: center;
    font-size: 1.1875rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
  }
  .done .value { color: var(--chalk-dim); }
  .value.empty, .cell.empty { color: var(--chalk-faint); font-weight: 500; }
  .cell, .clock { height: 44px; border: 1px solid transparent; border-radius: 10px; background: var(--iron-2); }
  .done .cell { background: transparent; color: var(--chalk-dim); }
  /* Warmups stay compact and quiet so the working sets lead. */
  .row.warmup { min-height: 44px; }
  .warmup .stepper, .warmup .cell, .warmup .tick, .warmup .timer { height: 36px; }
  .warmup .value, .warmup .cell { font-size: 1.0rem; color: var(--chalk-dim); font-weight: 500; }
  .clock { background: var(--iron-0); border-color: var(--plate-yellow); }
  .clock.final { color: var(--ink-yellow); }
  .clock.over { color: var(--ink-green); border-color: var(--plate-green); }

  .tick, .timer {
    display: grid;
    place-items: center;
    justify-self: center;
    width: 40px;
    height: 40px;
    padding: 0;
    border: 1.5px solid var(--iron-3);
    border-radius: 50%;
    background: transparent;
    color: var(--chalk-faint);
  }
  .timer { border-radius: 10px; color: var(--chalk-dim); }
  .timer.on { background: var(--plate-yellow); border-color: var(--plate-yellow); color: var(--iron-0); }
  .timer:disabled { opacity: 0.35; }
  .tick[aria-pressed='true'] { background: var(--go); border-color: var(--go); color: var(--on-go); }
  .tick[aria-pressed='true'] :global(svg) { animation: pop 200ms ease-out; }
  @keyframes pop { from { transform: scale(0.6); } }
</style>

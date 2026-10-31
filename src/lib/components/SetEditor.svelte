<script lang="ts">
  import type { Exercise, Gym, LoggedSet, SessionExercise, SetType } from '../model';
  import { isTimed } from '../model';
  import { formatWeight, stepValue } from '../logic/training';
  import { clock, parseSeconds, setText } from '../format';
  import { setSetType, stepFor, updateSet } from '../store.svelte';
  import Icon from './Icon.svelte';
  import PlateStrip from './PlateStrip.svelte';
  import Sheet from './Sheet.svelte';

  let {
    open = $bindable(false), set, item, ex, gym, title, previous, onlog, ondelete,
  }: {
    open: boolean;
    set: LoggedSet | null;
    item: SessionExercise;
    ex: Exercise;
    gym: Gym;
    title: string;
    previous?: LoggedSet;
    /** Log or unlog the set (the card knows its place in the workout); absent for a saved workout. */
    onlog?: (set: LoggedSet) => void;
    ondelete: (set: LoggedSet) => void;
  } = $props();

  const timed = $derived(isTimed(ex));
  const bodyweight = $derived(ex.equipment === 'bodyweight');
  const step = $derived(stepFor(ex, gym));
  const mmss = (sec: number) => clock(sec * 1000);

  /** Empty means no target: the set timer then runs as a stopwatch. */
  function updateTime(s: LoggedSet, input: HTMLInputElement) {
    if (input.value.trim() === '') return updateSet(s, 'durationSec', 0);
    const sec = parseSeconds(input.value);
    if (sec === null) input.value = s.durationSec ? mmss(s.durationSec) : '';
    else updateSet(s, 'durationSec', sec);
  }

  const types: [SetType, string][] = [['warmup', 'Warmup'], ['working', 'Working'], ['drop', 'Drop']];
</script>

<Sheet bind:open {title}>
  {#if set}
    {@const s = set}
    <div class="editor">
      {#if previous}<p class="muted last">Last time <span class="num">{setText(previous, ex)}</span></p>{/if}

      <div class="stepper">
        <span class="lbl" id="w-lbl">{bodyweight || timed ? 'Added weight' : 'Weight'} <span class="faint">kg, steps of {formatWeight(step)}</span></span>
        <div class="ctl">
          <button class="step" onclick={() => updateSet(s, 'weight', stepValue(s.weight, step, -1))} disabled={s.weight <= 0}
            aria-label="{formatWeight(step)} kg less"><Icon name="minus" /></button>
          <input autocomplete="off" class="num" type="number" inputmode="decimal" step="any" min="0" aria-labelledby="w-lbl"
            placeholder={bodyweight ? 'BW' : '0'} value={s.weight || ''}
            oninput={(e) => updateSet(s, 'weight', e.currentTarget.value === '' ? 0 : e.currentTarget.valueAsNumber)} />
          <button class="step" onclick={() => updateSet(s, 'weight', stepValue(s.weight, step, 1))}
            aria-label="{formatWeight(step)} kg more"><Icon name="plus" /></button>
        </div>
      </div>

      {#if timed}
        <div class="stepper">
          <span class="lbl" id="t-lbl">Time held <span class="faint">steps of 5 s</span></span>
          <div class="ctl">
            <button class="step" onclick={() => updateSet(s, 'durationSec', stepValue(s.durationSec ?? 0, 5, -1))}
              disabled={!s.durationSec} aria-label="5 seconds less"><Icon name="minus" /></button>
            <input autocomplete="off" class="num" type="text" inputmode="numeric" placeholder="0:00" aria-labelledby="t-lbl"
              value={s.durationSec ? mmss(s.durationSec) : ''} onchange={(e) => updateTime(s, e.currentTarget)} />
            <button class="step" onclick={() => updateSet(s, 'durationSec', stepValue(s.durationSec ?? 0, 5, 1))}
              aria-label="5 seconds more"><Icon name="plus" /></button>
          </div>
        </div>
      {:else}
        <div class="stepper">
          <span class="lbl" id="r-lbl">Reps</span>
          <div class="ctl">
            <button class="step" onclick={() => updateSet(s, 'reps', stepValue(s.reps, 1, -1))} disabled={s.reps <= 0}
              aria-label="One rep less"><Icon name="minus" /></button>
            <input autocomplete="off" class="num" type="number" inputmode="numeric" min="0" aria-labelledby="r-lbl" value={s.reps}
              oninput={(e) => updateSet(s, 'reps', e.currentTarget.value === '' ? 0 : e.currentTarget.valueAsNumber)} />
            <button class="step" onclick={() => updateSet(s, 'reps', stepValue(s.reps, 1, 1))}
              aria-label="One rep more"><Icon name="plus" /></button>
          </div>
        </div>
      {/if}

      {#if ex.equipment === 'barbell' && s.weight > 0}
        <PlateStrip weight={s.weight} {gym} />
      {/if}

      {#if s.type !== 'myo' && s.type !== 'mini'}
        <div class="seg" role="group" aria-label="Set type">
          {#each types as [type, text] (type)}
            <button aria-pressed={s.type === type} onclick={() => setSetType(item, s, type)}>{text}</button>
          {/each}
        </div>
      {/if}

      {#if onlog}
        <button class="btn block" class:go={!s.done} onclick={() => onlog(s)}>
          <Icon name="check" /> {s.done ? 'Unlog set' : 'Log set'}
        </button>
      {:else}
        <button class="btn primary block" onclick={() => (open = false)}>Done</button>
      {/if}
      <button class="btn danger block" onclick={() => { ondelete(s); open = false; }}>
        <Icon name="trash" /> Delete set
      </button>
    </div>
  {/if}
</Sheet>

<style>
  .editor { display: grid; gap: 18px; }
  .last { margin: 0; }
  .stepper { display: grid; gap: 8px; }
  .lbl { font-weight: 600; }
  .lbl .faint { font-weight: 400; font-size: 0.9375rem; }
  .ctl { display: grid; grid-template-columns: 64px minmax(0, 1fr) 64px; gap: 10px; }
  .step {
    display: grid; place-items: center; height: 60px; border: 1px solid var(--line); border-radius: var(--r-md);
    background: var(--iron-2); color: var(--chalk);
  }
  .step:active { background: var(--iron-3); }
  .step:disabled { opacity: 0.35; }
  input {
    width: 100%; height: 60px; padding: 0 8px; border: 1px solid var(--line); border-radius: var(--r-md);
    background: var(--iron-0); text-align: center; font-size: 1.75rem; font-weight: 700;
    -moz-appearance: textfield; appearance: textfield;
  }
  input::placeholder { color: var(--chalk-faint); font-weight: 500; }
  input::-webkit-inner-spin-button, input::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
  input:focus { outline: none; border-color: var(--chalk-dim); }
  .seg button { min-height: 44px; }
</style>

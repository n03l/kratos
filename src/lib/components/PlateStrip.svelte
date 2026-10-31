<script lang="ts">
  import type { Gym } from '../model';
  import { formatWeight, plateLoad } from '../logic/training';

  let { weight, gym }: { weight: number; gym: Gym } = $props();

  const load = $derived(plateLoad(weight, gym.bar, gym.plates));

  // Competition colours: 25 red, 20 blue, 15 yellow, 10 green, 5 white; change plates follow the same order.
  const style: Record<string, { c: string; h: number; w: number }> = {
    '25': { c: 'var(--plate-red)', h: 48, w: 11 },
    '20': { c: 'var(--plate-blue)', h: 48, w: 10 },
    '15': { c: 'var(--plate-yellow)', h: 42, w: 9 },
    '10': { c: 'var(--plate-green)', h: 36, w: 8 },
    '5': { c: 'var(--plate-white)', h: 28, w: 7 },
    '2.5': { c: 'var(--plate-red)', h: 22, w: 5 },
    '2': { c: 'var(--plate-blue)', h: 21, w: 5 },
    '1.25': { c: '#9aa0ab', h: 18, w: 4 },
    '1': { c: 'var(--plate-green)', h: 17, w: 4 },
    '0.5': { c: 'var(--plate-white)', h: 15, w: 3 },
  };
  const look = (p: number) => style[String(p)] ?? { c: '#9aa0ab', h: 16, w: 4 };
</script>

<div class="strip" aria-label="{formatWeight(weight)} kg: {load.perSide.length ? load.perSide.map(formatWeight).join(', ') + ' kg per side' : 'empty bar'}">
  <div class="bar" aria-hidden="true">
    <span class="sleeve"></span>
    <span class="collar"></span>
    {#each load.perSide as p, i (i)}
      <span class="plate" style:background={look(p).c} style:height="{Math.round(look(p).h * 0.75)}px" style:width="{Math.max(3, Math.round(look(p).w * 0.8))}px"></span>
    {/each}
    <span class="end"></span>
  </div>
  <p class="label">
    <span class="num">{load.perSide.length ? load.perSide.map(formatWeight).join(' + ') : 'Empty bar'}</span>
    <span class="faint">{load.perSide.length ? 'per side' : ''} on a {formatWeight(gym.bar)} kg bar</span>
  </p>
  {#if load.leftover > 0}
    <p class="warn small">{gym.name} plates can't make the last {formatWeight(load.leftover)} kg.</p>
  {/if}
</div>

<style>
  .strip { display: grid; grid-template-columns: auto 1fr; align-items: center; gap: 4px 14px; }
  .bar { display: flex; align-items: center; gap: 2px; height: 38px; }
  .sleeve { width: 14px; height: 5px; border-radius: 3px 0 0 3px; background: var(--iron-3); }
  .collar { width: 3px; height: 12px; border-radius: 2px; background: var(--chalk-faint); }
  .plate { border-radius: 2px; }
  .end { width: 6px; height: 5px; border-radius: 0 3px 3px 0; background: var(--iron-3); }
  .label { margin: 0; display: grid; line-height: 1.2; }
  .label .num { font-size: 1rem; font-weight: 600; }
  .label .faint { font-size: 0.9375rem; }
  .warn { grid-column: 1 / -1; margin: 0; color: var(--ink-yellow); }
</style>

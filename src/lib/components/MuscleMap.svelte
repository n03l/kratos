<script lang="ts">
  import { muscleLevel } from '../logic/muscles';
  import type { Snippet } from 'svelte';
  import type { Muscle } from '../model';

  /** `height` draws a small pair of figures without captions, for lists; the summary goes in the label. */
  let { sets, height }: { sets: Map<Muscle, number>; height?: number } = $props();

  const lv = (m: Muscle) => `m l${muscleLevel(sets.get(m) ?? 0)}`;
  const worked = $derived([...sets].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]));
  const label = (m: Muscle) => m[0].toUpperCase() + m.slice(1);
  const summary = $derived(worked.length ? `Sets per muscle: ${worked.map(([m, n]) => `${label(m)} ${n}`).join(', ')}` : 'No muscles listed');
</script>

<!-- Each figure is drawn as its left half, then mirrored about x = 50 (the halves overlap by 0.5 to hide the seam,
     so both outlines go first and the muscles on top). -->
{#snippet body()}
  <path d="M50.5 4.5 C45 4.5 41.5 8.5 41.5 15 C41.5 20 43.5 23.5 46 25.5 L46 28 C42 30 36 31 32 33 C26 35 22.5 39 22.5 46
    L20 76 C18.5 86 16.5 98 15.5 110 C13.5 114 12.5 120 13.5 124 C15 126.5 17.5 125.5 18.5 122 L19.5 116
    C20.5 113 21.5 111 22 109 C23.5 98 26 88 27 78 L30 57 C30.5 54.5 31.5 53 32 53 C33 66 35 80 36 90
    C35 96 33.5 101 33.5 106 C32 118 33 136 36.5 150 C35 158 34 166 35.5 174 C37 182 39 188 39.5 193
    C37 196 37 200 40 201 L47 201 C48.5 199 47 195 46.5 192 C47.5 182 49 168 47.5 156 L47.5 150
    C48.5 138 49.5 124 49.5 116 L50.5 115 Z" />
{/snippet}

{#snippet front()}
  <path class={lv('shoulders')} d="M33.5 34 C28 35 24 38.5 23.5 45 C23.3 49 24.2 52.5 25.8 55 C27.5 49.5 30.5 44 34.5 40.5 C35.5 38 35 35.5 33.5 34 Z" />
  <path class={lv('chest')} d="M50.5 37 L38 37 C35 38.5 33 43 33 49 C34.5 54.5 39 58 44 58.5 C47 58.7 49.5 57.5 50.5 56.5 Z" />
  <path class={lv('biceps')} d="M25.5 57.5 C23.5 63 23 70 23.5 75.5 C25 77.5 27 77.5 28 75.5 C29.3 68 29.6 62 28.8 57.5 C28 55.5 26.5 55.5 25.5 57.5 Z" />
  <rect class={lv('core')} x="44.6" y="61" width="4.9" height="8.5" rx="1.8" />
  <rect class={lv('core')} x="44.6" y="71" width="4.9" height="8.5" rx="1.8" />
  <rect class={lv('core')} x="44.6" y="81" width="4.9" height="8.5" rx="1.8" />
  <path class={lv('core')} d="M44.6 91 L49.5 91 L49.5 103 C47.5 102 45.5 99 44.6 95 Z" />
  <path class={lv('core')} d="M42.8 62 L37.5 63 C38.5 72 39.5 82 40 91 C41 95 42 97.5 43 98.5 Z" />
  <path class={lv('quads')} d="M34.6 114 C33 126 34 138 37.6 147 C39.2 145 39.7 136 39.6 126 C39.5 119 37.6 115 34.6 114 Z" />
  <path class={lv('quads')} d="M41.3 109.5 C38.8 118 39.6 135 41.8 144.5 C43.8 135 45.6 120 45.2 110 C44 108.3 42.4 108.3 41.3 109.5 Z" />
  <path class={lv('quads')} d="M46.2 131.5 C43.8 137 42.8 143 44.2 148 C45.6 150 47.4 149 48 146 C48.4 140 47.6 135 46.2 131.5 Z" />
  <path class={lv('calves')} d="M37 155.5 C35.3 162 35.4 170 37.2 177 C39.2 173 39.8 163 38.6 156 Z" />
  <path class={lv('calves')} d="M46.2 155.5 C44 161 43.8 170 45.6 177.5 C47.4 176.5 48.6 170 48.4 163 C48.2 159 47.4 156.5 46.2 155.5 Z" />
{/snippet}

{#snippet back()}
  <path class={lv('back')} d="M50.5 25 C49 29 46 30 42 31 C38 32 35.5 33 34 34.5 C37.5 37 41.5 39.5 44.5 43.5 C46.8 48 48.6 54 50.5 60 Z" />
  <path class={lv('shoulders')} d="M33 35.5 C28 36 24 39 23.5 45 C23.3 49 24.2 52.5 25.8 55 C27.8 50.5 30.5 46.5 33.5 44 C35 41.5 35 38 33 35.5 Z" />
  <path class={lv('back')} d="M43 46 C39 44.5 35.5 46 33.4 50 C33.8 61 35.6 72 39 81 C41.6 84 44.2 86 46 87.5 L46 66 C46 58 45 51 43 46 Z" />
  <path class={lv('back')} d="M47.6 64 C47 76 47 88 47.8 101 L50.5 101 L50.5 62 Z" />
  <path class={lv('triceps')} d="M24.8 57.5 C22.8 63 22.6 70 23.4 75.5 C25 77.5 27 77.5 28 75.5 C29.4 68 29.8 61.5 28.6 57 C27.6 55 25.8 55.2 24.8 57.5 Z" />
  <path class={lv('glutes')} d="M50.5 103 C44 102 38.5 103.5 35.4 107 C34 113 35 118.5 38 121.8 C42 124.4 46.8 123.6 50.5 121.5 Z" />
  <path class={lv('hamstrings')} d="M36 125.5 C35 133 36 142 39 149 C41 146 41.6 138 41.2 129 C40.6 126 38.4 124.8 36 125.5 Z" />
  <path class={lv('hamstrings')} d="M43.2 126 C42.6 134 43 142 44.6 149 C46.6 146 47.8 137 47.6 127.5 C46.4 125.5 44.6 125.2 43.2 126 Z" />
  <path class={lv('calves')} d="M37.4 154 C35.4 160 35.2 168 37.6 174.5 C39.6 175.5 41.2 172 41.2 166 C41.2 160 40.2 156 37.4 154 Z" />
  <path class={lv('calves')} d="M43.2 154 C42.2 160 42.6 169 44.6 176 C46.6 176 48 170 47.9 163 C47.7 158 46 155 43.2 154 Z" />
{/snippet}

{#snippet figure(half: Snippet)}
  <svg viewBox="8 2 84 202">
    {@render body()}
    <g transform="matrix(-1 0 0 1 100 0)">{@render body()}</g>
    {@render half()}
    <g transform="matrix(-1 0 0 1 100 0)">{@render half()}</g>
  </svg>
{/snippet}

{#if height}
  <span class="mini" role="img" aria-label={summary} style:height="{Math.round(height)}px">
    {@render figure(front)}
    {@render figure(back)}
  </span>
{:else}
  <figure class="map">
    <div class="figs" aria-hidden="true">
      {#each [['Front', front], ['Back', back]] as const as [name, half] (name)}
        <div class="fig">
          {@render figure(half)}
          <span class="small faint">{name}</span>
        </div>
      {/each}
    </div>
    <figcaption class="small muted">
      {#if worked.length}
        <span>Hard sets:</span>
        {#each worked as [m, n] (m)}<span class="num">{label(m)} {n}</span>{/each}
      {:else}
        No hard sets logged.
      {/if}
    </figcaption>
  </figure>
{/if}

<style>
  .map { margin: 0; display: grid; gap: 10px; }
  .figs { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .fig { display: grid; justify-items: center; gap: 2px; }
  svg { width: 100%; max-width: 150px; height: auto; display: block; fill: var(--map-body, var(--iron-2)); }
  /* On a raised surface, set --map-body and --map-rest a step lighter. */
  .l0 { fill: var(--map-rest, var(--iron-3)); }
  /* Solid mixes rather than opacity, so the overlapping halves don't show a seam. */
  .l1 { fill: color-mix(in srgb, var(--chalk) 38%, var(--iron-2)); }
  .l2 { fill: color-mix(in srgb, var(--chalk) 66%, var(--iron-2)); }
  .l3 { fill: var(--chalk); }
  figcaption { display: flex; flex-wrap: wrap; justify-content: center; gap: 2px 12px; }
  figcaption span { white-space: nowrap; }
  .mini { display: inline-flex; flex: none; gap: 2px; }
  .mini svg { width: auto; height: 100%; }
</style>

<script lang="ts">
  import { formatRest } from '../logic/rest';

  let {
    value = $bindable(), label, presets = [30, 60, 90, 120, 180, 240], step = 15, min = 0, max = 900,
  }: { value: number; label: string; presets?: number[]; step?: number; min?: number; max?: number } = $props();

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
</script>

<fieldset class="picker">
  <legend class="h3">{label}</legend>
  <div class="stepper">
    <button type="button" class="btn ghost num" onclick={() => (value = clamp(value - step))} aria-label="{step} seconds less">−{step}</button>
    <output class="num value" aria-live="polite">{formatRest(value)}</output>
    <button type="button" class="btn ghost num" onclick={() => (value = clamp(value + step))} aria-label="{step} seconds more">+{step}</button>
  </div>
  <div class="presets" role="group" aria-label="{label} presets">
    {#each presets as p (p)}
      <button type="button" class="chip num" aria-pressed={value === p} onclick={() => (value = p)}>{formatRest(p)}</button>
    {/each}
  </div>
</fieldset>

<style>
  .picker { border: 0; margin: 0; padding: 0; display: grid; gap: 10px; }
  legend { padding: 0; margin-bottom: 8px; }
  .stepper { display: grid; grid-template-columns: 72px 1fr 72px; align-items: center; gap: 8px; }
  .value { text-align: center; font-size: 2.25rem; font-weight: 700; }
  .presets { display: flex; flex-wrap: wrap; gap: 6px; }
  .presets .chip { min-width: 56px; justify-content: center; font-size: 1rem; }
</style>

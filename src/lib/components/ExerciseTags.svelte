<script lang="ts">
  import { MUSCLES, type Equipment, type Muscle } from '../model';

  const EQUIPMENT: Equipment[] = ['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other'];

  let { equipment, muscles, onequipment, onmuscles }: {
    equipment: Equipment;
    muscles: Muscle[];
    onequipment: (e: Equipment) => void;
    onmuscles: (m: Muscle[]) => void;
  } = $props();

  const toggle = (m: Muscle) => onmuscles(muscles.includes(m) ? muscles.filter((x) => x !== m) : [...muscles, m]);
</script>

<!-- Equipment and muscles of an exercise, as chips. Used when creating and when editing one. -->
<fieldset class="tags">
  <legend class="small muted">Equipment</legend>
  <div class="wrap">
    {#each EQUIPMENT as eq (eq)}
      <button type="button" class="chip cap" aria-pressed={equipment === eq} onclick={() => onequipment(eq)}>{eq}</button>
    {/each}
  </div>
</fieldset>
<fieldset class="tags">
  <legend class="small muted">Muscles</legend>
  <div class="wrap">
    {#each MUSCLES as m (m)}
      <button type="button" class="chip cap" aria-pressed={muscles.includes(m)} onclick={() => toggle(m)}>{m}</button>
    {/each}
  </div>
</fieldset>

<style>
  .tags { border: 0; margin: 0; padding: 0; }
  legend { margin-bottom: 6px; padding: 0; }
  .wrap { display: flex; flex-wrap: wrap; gap: 6px; }
  .cap { text-transform: capitalize; }
</style>

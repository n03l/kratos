<script lang="ts">
  import { app, db, switchGym, gym, gymColor } from '../store.svelte';
  import Sheet from './Sheet.svelte';
  import Icon from './Icon.svelte';

  let { open = $bindable(false), chip = true }: { open?: boolean; /** Show the chip; without it only the picker sheet. */ chip?: boolean } = $props();
  const current = $derived(gym(app.gymId));
</script>

{#if chip}
  <button class="chip gym" onclick={() => (open = true)} aria-label="Gym: {current?.name}. Change gym">
    <span class="dot" style:background={gymColor(current)}></span>
    {current?.name}
  </button>
{/if}

<Sheet bind:open title="Where are you training?">
  <p class="muted small hint">Machine and cable exercises use this gym's history, records and setup notes.</p>
  <ul class="list">
    {#each db().gyms as g (g.id)}
      <li>
        <button class="pick" aria-pressed={g.id === app.gymId} onclick={() => { switchGym(g.id); app.gymNotice = null; open = false; }}>
          <span class="dot lg" style:background={gymColor(g)}></span>
          <span class="name">{g.name}</span>
          {#if g.id === app.gymId}<Icon name="check" />{/if}
        </button>
      </li>
    {/each}
  </ul>
  <a class="btn ghost block manage" href="#/more" onclick={() => (open = false)}>Manage gyms</a>
</Sheet>

<style>
  .gym { color: var(--chalk); max-width: 60vw; overflow: hidden; text-overflow: ellipsis; }
  .dot { flex: none; width: 10px; height: 10px; border-radius: 50%; }
  .dot.lg { width: 14px; height: 14px; }
  .hint { margin: 0 0 8px; }
  .pick {
    display: flex; align-items: center; gap: 14px; width: 100%; min-height: 56px;
    padding: 0; border: 0; background: none; text-align: left; font-weight: 500;
  }
  .name { flex: 1; }
  .manage { margin-top: 12px; }
</style>

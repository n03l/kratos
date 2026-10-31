<script lang="ts">
  import { db } from '../store.svelte';
  import Sheet from './Sheet.svelte';
  import Icon from './Icon.svelte';
  import { byName, exerciseMeta } from '../format';

  let { open = $bindable(false), onpick }: { open: boolean; onpick: (exerciseId: string) => void } = $props();
  let q = $state('');

  const found = $derived(
    db().exercises
      .filter((e) => !e.archived)
      .filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()) || e.muscles.some((m) => m.startsWith(q.trim().toLowerCase())))
      .sort(byName),
  );
</script>

<Sheet bind:open title="Add exercise">
  <label class="search">
    <Icon name="search" size={20} />
    <span class="sr-only">Search exercises</span>
    <input autocomplete="off" class="input" type="search" placeholder="Search by name or muscle" bind:value={q} />
  </label>
  <ul class="list results">
    {#each found as e (e.id)}
      <li>
        <button class="pick" onclick={() => { onpick(e.id); open = false; q = ''; }}>
          <span class="name">{e.name}</span>
          <span class="small muted">{exerciseMeta(e)}</span>
        </button>
      </li>
    {:else}
      <li class="muted empty">No exercise matches “{q}”. Add it from the Exercises tab.</li>
    {/each}
  </ul>
</Sheet>

<style>
  .search { position: relative; display: block; }
  .search :global(svg) { position: absolute; left: 12px; top: 14px; color: var(--chalk-faint); }
  .search input { padding-left: 42px; }
  .results { max-height: 55dvh; overflow-y: auto; margin-top: 8px; }
  .pick {
    display: grid; width: 100%; min-height: 56px; padding: 8px 0; border: 0; background: none;
    text-align: left; gap: 1px;
  }
  .name { font-weight: 500; overflow-wrap: anywhere; }
  .empty { padding: 16px 0; }
</style>

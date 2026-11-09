<script lang="ts">
  import { db, exercise } from '../store.svelte';
  import Sheet from './Sheet.svelte';
  import Icon from './Icon.svelte';
  import { byName, exerciseMeta } from '../format';
  import type { Exercise } from '../model';

  let { open = $bindable(false), onpick }: { open: boolean; onpick: (exerciseId: string) => void } = $props();
  let q = $state('');

  const found = $derived(
    db().exercises
      .filter((e) => !e.archived)
      .filter((e) => e.name.toLowerCase().includes(q.trim().toLowerCase()) || e.muscles.some((m) => m.startsWith(q.trim().toLowerCase())))
      .sort(byName),
  );
  const searching = $derived(!!q.trim());

  // The five exercises last used, newest first, for the top of the list.
  const recent = $derived.by(() => {
    const ids: string[] = [];
    outer: for (const s of db().sessions) {
      for (const b of s.blocks) {
        for (const it of b.items) {
          if (!ids.includes(it.exerciseId)) ids.push(it.exerciseId);
          if (ids.length === 5) break outer;
        }
      }
    }
    return ids.flatMap((id) => {
      const e = exercise(id);
      return e && !e.archived ? [e] : [];
    });
  });
  const recentIds = $derived(new Set(recent.map((e) => e.id)));
  const rest = $derived(searching ? found : found.filter((e) => !recentIds.has(e.id)));
</script>

{#snippet row(e: Exercise)}
  <li>
    <button class="pick" onclick={() => { onpick(e.id); open = false; q = ''; }}>
      <span class="name">{e.name}</span>
      <span class="small muted">{exerciseMeta(e)}</span>
    </button>
  </li>
{/snippet}

<Sheet bind:open title="Add exercise">
  <label class="search">
    <Icon name="search" size={20} />
    <span class="sr-only">Search exercises</span>
    <input autocomplete="off" class="input" type="search" placeholder="Search by name or muscle" bind:value={q} />
  </label>
  <div class="picker-scroll">
    {#if !searching && recent.length}
      <p class="group small faint">Recent</p>
      <ul class="list">{#each recent as e (e.id)}{@render row(e)}{/each}</ul>
      {#if rest.length}<p class="group small faint">All exercises</p>{/if}
    {/if}
    {#if rest.length}
      <ul class="list">{#each rest as e (e.id)}{@render row(e)}{/each}</ul>
    {:else if searching}
      <p class="muted empty">No exercise matches “{q}”. Add it from the Exercises tab.</p>
    {:else if !recent.length}
      <p class="muted empty">No exercises yet. Add one from the Exercises tab.</p>
    {/if}
  </div>
</Sheet>

<style>
  .search { position: relative; display: block; }
  .search :global(svg) { position: absolute; left: 12px; top: 14px; color: var(--chalk-faint); }
  .search input { padding-left: 42px; }
  .picker-scroll { max-height: 55dvh; overflow-y: auto; margin-top: 8px; }
  .group { margin: 14px 0 2px; }
  .group:first-child { margin-top: 0; }
  .pick {
    display: grid; width: 100%; min-height: 56px; padding: 8px 0; border: 0; background: none;
    text-align: left; gap: 1px;
  }
  .name { font-weight: 500; overflow-wrap: anywhere; }
  .empty { margin: 8px 0; }
</style>

<script lang="ts">
  import Icon from '../lib/components/Icon.svelte';
  import {
    activeRoutines, createRoutine, db, exercise, setPlanArchived, setRoutineArchived, startWorkout,
  } from '../lib/store.svelte';
  import { navigate } from '../lib/router.svelte';
  import { dayOf, groupByPlan } from '../lib/logic/plans';
  import type { Routine } from '../lib/model';

  // Plans come from names: "Plan > Day" (see logic/plans.ts).
  const active = $derived(groupByPlan(activeRoutines()));
  const archived = $derived(groupByPlan(db().routines.filter((r) => r.archived)));
  const archivedCount = $derived(archived.reduce((n, g) => n + g.routines.length, 0));
  let showArchived = $state(false);
  /** Archived plans opened to show their days. */
  let opened = $state<string[]>([]);

  const toggle = (plan: string) => (opened = opened.includes(plan) ? opened.filter((p) => p !== plan) : [...opened, plan]);
  const outline = (r: Routine) =>
    r.blocks.map((b) => b.items.map((i) => exercise(i.exerciseId)?.name ?? 'Unknown').join(' + ')).join(', ') || 'No exercises yet';
  const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
</script>

<section class="page">
  <div>
    <a class="back" href="#/more"><Icon name="back" size={20} /> More</a>
    <header class="page-head">
      <h1 class="title">Routines</h1>
      <button class="btn sm" onclick={() => navigate(`/routines/${createRoutine()}`)}><Icon name="plus" size={18} /> New routine</button>
    </header>
    <p class="small muted intro">Name a routine “Plan &gt; Day” to group it into a plan, like “ULUL &gt; Upper #1”. Today suggests the next day of the plan you're following.</p>
  </div>

  {#each active as g (g.plan)}
    <section class="section" aria-label={g.plan || 'Routines without a plan'}>
      {#if g.plan}
        <div class="spread plan-head">
          <h2 class="h2 plan-name">{g.plan}</h2>
          <button class="btn sm ghost" onclick={() => setPlanArchived(g.plan, true)}><Icon name="archive" size={18} /> Archive plan</button>
        </div>
      {/if}
      <ul class="list">
        {#each g.routines as r (r.id)}
          <li class="spread row">
            <a class="grow plain" href="#/routines/{encodeURIComponent(r.id)}">
              <span class="h3">{dayOf(r.name)}</span>
              <span class="small muted outline">{outline(r)}</span>
            </a>
            <button class="btn sm ghost" onclick={() => { startWorkout(r.id); navigate('/workout'); }}>Start</button>
          </li>
        {/each}
      </ul>
      {#if g.plan}
        <button class="btn sm ghost add-day" onclick={() => navigate(`/routines/${createRoutine(g.plan)}`)}>
          <Icon name="plus" size={18} /> Add a day to {g.plan}
        </button>
      {/if}
    </section>
  {:else}
    <p class="muted empty">
      {archivedCount ? 'Every routine is archived. Restore a plan below or create a new routine.' : 'No routines yet. Create one to plan sets, supersets and progression.'}
    </p>
  {/each}

  {#if archivedCount}
    <section class="section">
      <button class="btn ghost block" aria-expanded={showArchived} onclick={() => (showArchived = !showArchived)}>
        {showArchived ? 'Hide' : 'Show'} {archivedCount} archived {archivedCount === 1 ? 'routine' : 'routines'}
      </button>
      {#if showArchived}
        <ul class="list">
          {#each archived as g (g.plan)}
            {#if g.plan}
              <li class="arch-plan">
                <div class="spread row">
                  <button class="grow plain toggle" aria-expanded={opened.includes(g.plan)} onclick={() => toggle(g.plan)}>
                    <span class="h3 dim">{g.plan}</span>
                    <span class="small faint">{days(g.routines.length)}: {g.routines.map((r) => dayOf(r.name)).join(', ')}</span>
                  </button>
                  <button class="btn sm ghost" onclick={() => setPlanArchived(g.plan, false)}>Restore plan</button>
                </div>
                {#if opened.includes(g.plan)}
                  <ul class="list days">
                    {#each g.routines as r (r.id)}
                      <li class="spread row">
                        <a class="grow plain" href="#/routines/{encodeURIComponent(r.id)}">
                          <span class="dim">{dayOf(r.name)}</span>
                          <span class="small faint outline">{outline(r)}</span>
                        </a>
                        <button class="btn sm ghost" onclick={() => setRoutineArchived(r.id, false)}>Restore</button>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </li>
            {:else}
              {#each g.routines as r (r.id)}
                <li class="spread row">
                  <a class="grow plain" href="#/routines/{encodeURIComponent(r.id)}">
                    <span class="h3 dim">{r.name}</span>
                    <span class="small faint outline">{outline(r)}</span>
                  </a>
                  <button class="btn sm ghost" onclick={() => setRoutineArchived(r.id, false)}>Restore</button>
                </li>
              {/each}
            {/if}
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</section>

<style>
  .intro { margin: 8px 0 0; }
  .plan-head { flex-wrap: wrap; }
  .plan-name { overflow-wrap: anywhere; min-width: 0; }
  .row { padding: 12px 0; }
  .grow { flex: 1; display: grid; min-width: 0; gap: 2px; }
  .plain { text-decoration: none; color: inherit; }
  .toggle { border: 0; background: none; padding: 0; text-align: left; }
  .outline { overflow-wrap: anywhere; }
  .empty { padding: 20px 0; margin: 0; }
  .dim { color: var(--chalk-dim); }
  .add-day { justify-self: start; margin-left: -8px; padding: 0 8px; border-color: transparent; color: var(--chalk-dim); }
  .days { margin-left: 16px; }
</style>

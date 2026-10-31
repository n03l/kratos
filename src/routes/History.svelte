<script lang="ts">
  import Icon from '../lib/components/Icon.svelte';
  import { db, gym, gymColor } from '../lib/store.svelte';
  import { dayLabel, duration, startOfDay, timeLabel, tonnes } from '../lib/format';
  import { volume } from '../lib/logic/training';
  import { dayOf, planOf } from '../lib/logic/plans';

  let gymFilter = $state<string | null>(null);
  const today = new Date();
  let month = $state(new Date(today.getFullYear(), today.getMonth(), 1));

  const sessions = $derived(db().sessions.filter((s) => !gymFilter || s.gymId === gymFilter));

  const grid = $derived.by(() => {
    const first = new Date(month);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: { day: number; ms: number }[] = [];
    for (let i = 0; i < lead; i++) cells.push({ day: 0, ms: 0 });
    for (let d = 1; d <= days; d++) cells.push({ day: d, ms: new Date(month.getFullYear(), month.getMonth(), d).getTime() });
    return cells;
  });

  const byDay = $derived.by(() => {
    const m = new Map<number, typeof sessions>();
    for (const s of sessions) {
      const k = startOfDay(new Date(s.startedAt));
      m.set(k, [...(m.get(k) ?? []), s]);
    }
    return m;
  });

  // Long histories render in pages; the calendar still marks every workout.
  const PAGE = 30;
  let shown = $state(PAGE);
  const monthFormat = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

  const groups = $derived.by(() => {
    // One group per month, even if the list is ever out of order (labels are the keys below).
    const out = new Map<string, typeof sessions>();
    for (const s of sessions.slice(0, shown)) {
      const label = monthFormat.format(new Date(s.startedAt));
      const items = out.get(label);
      if (items) items.push(s);
      else out.set(label, [s]);
    }
    return [...out].map(([label, items]) => ({ label, items }));
  });

  function shift(n: number) {
    month = new Date(month.getFullYear(), month.getMonth() + n, 1);
  }
  const weekdays = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'narrow' }));
</script>

<section class="page">
  <h1 class="title">History</h1>

  <div class="scroll-x" role="group" aria-label="Filter by gym">
    <button class="chip" aria-pressed={gymFilter === null} onclick={() => (gymFilter = null)}>All gyms</button>
    {#each db().gyms as g (g.id)}
      <button class="chip" aria-pressed={gymFilter === g.id} onclick={() => (gymFilter = g.id)}>
        <span class="gym-dot" style:background={gymColor(g)}></span>{g.name}
      </button>
    {/each}
  </div>

  <section class="cal surface pad" aria-label="Calendar">
    <div class="spread">
      <button class="icon-btn" onclick={() => shift(-1)} aria-label="Previous month"><Icon name="back" /></button>
      <h2 class="h3">{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
      <button class="icon-btn" onclick={() => shift(1)} aria-label="Next month"><Icon name="chevron" /></button>
    </div>
    <div class="grid" role="presentation">
      {#each weekdays as w, i (i)}<span class="wd small faint">{w}</span>{/each}
      {#each grid as c, i (i)}
        {#if c.day === 0}
          <span></span>
        {:else}
          {@const ss = byDay.get(c.ms) ?? []}
          {#if ss.length}
            <a class="cell num on" class:today={c.ms === startOfDay(today)} href="#/session/{encodeURIComponent(ss[0].id)}" style:--c={gymColor(gym(ss[0].gymId))}
              aria-label="{new Date(c.ms).toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}: {ss.map((s) => s.name).join(', ')}">{c.day}</a>
          {:else}
            <span class="cell num" class:today={c.ms === startOfDay(today)}>{c.day}</span>
          {/if}
        {/if}
      {/each}
    </div>
  </section>

  {#each groups as grp (grp.label)}
    <section class="section">
      <h2 class="h2">{grp.label}</h2>
      <ul class="list">
        {#each grp.items as s (s.id)}
          {@const items = s.blocks.flatMap((b) => b.items)}
          <li>
            <a class="list-link" href="#/session/{encodeURIComponent(s.id)}">
              <span class="gym-dot" style:background={gymColor(gym(s.gymId))}></span>
              <span class="grow">
                <span class="spread"><span class="h3">{dayOf(s.name)}</span><span class="small muted num">{dayLabel(s.startedAt)}, {timeLabel(s.startedAt)}</span></span>
                <span class="small muted">{planOf(s.name) ? `${planOf(s.name)} · ` : ''}{gym(s.gymId)?.name}, {duration(s.durationMin)}, {tonnes(items.reduce((t, i) => t + volume(i.sets), 0))}</span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <div class="surface pad">
      <p class="h3">No workouts here yet</p>
      <p class="muted small">Workouts you finish{gymFilter ? ` at ${gym(gymFilter)?.name}` : ''} show up in this list.</p>
    </div>
  {/each}
  {#if sessions.length > shown}
    <button class="btn ghost block" onclick={() => (shown += PAGE * 4)}>Show more ({sessions.length - shown} older)</button>
  {/if}
</section>

<style>
  .cal { display: grid; gap: 8px; padding: 10px 12px 14px; }
  .grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; text-align: center; }
  .wd { padding-bottom: 2px; }
  .cell {
    position: relative; display: grid; place-items: center; aspect-ratio: 1; max-height: 44px; margin: 0 auto;
    width: 100%; max-width: 44px; border-radius: 50%; color: var(--chalk-faint); font-size: 1rem; text-decoration: none;
  }
  /* A workout day: lifted surface plus a dot in the gym's colour. */
  .cell.on { background: var(--iron-3); color: var(--chalk); font-weight: 500; }
  .cell.on::after {
    content: ''; position: absolute; bottom: 5px; left: 50%; width: 5px; height: 5px; margin-left: -2.5px;
    border-radius: 50%; background: var(--c);
  }
  .cell.today { box-shadow: inset 0 0 0 1.5px var(--chalk-dim); color: var(--chalk); }
  .grow { flex: 1; display: grid; min-width: 0; }
</style>

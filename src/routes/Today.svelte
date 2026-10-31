<script lang="ts">
  import Logo from '../lib/components/Logo.svelte';
  import GymChip from '../lib/components/GymChip.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import MuscleMap from '../lib/components/MuscleMap.svelte';
  import { activeRoutines, app, db, exercise, gym, gymColor, startWorkout } from '../lib/store.svelte';
  import { navigate } from '../lib/router.svelte';
  import { clock, dayLabel, startOfDay, startOfWeek, tonnes } from '../lib/format';
  import { volume } from '../lib/logic/training';
  import { dayOf, nextRoutine, planOf } from '../lib/logic/plans';
  import { routineSetsPerMuscle } from '../lib/logic/muscles';
  import type { Routine, Session } from '../lib/model';

  const now = new Date();
  const routines = $derived(activeRoutines());
  const last = $derived(db().sessions[0]);

  // The next day of the plan you're following (see nextRoutine).
  const next = $derived(nextRoutine(routines, db().sessions.map((s) => s.routineId)));
  // The rest of that plan first, then everything else.
  const others = $derived.by(() => {
    const plan = next ? planOf(next.name) : '';
    const rest = routines.filter((r) => r.id !== next?.id);
    return plan ? [...rest.filter((r) => planOf(r.name) === plan), ...rest.filter((r) => planOf(r.name) !== plan)] : rest;
  });

  const week = $derived.by(() => {
    const monday = startOfWeek(now);
    // Workouts are stored newest first, so this week's are at the start.
    const recent: Session[] = [];
    for (const s of db().sessions) {
      if (Date.parse(s.startedAt) < monday.getTime()) break;
      recent.push(s);
    }
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const sessions = recent.filter((s) => startOfDay(new Date(s.startedAt)) === d.getTime());
      return { d, sessions, today: d.getTime() === startOfDay(now) };
    });
  });
  const weekSessions = $derived(week.flatMap((w) => w.sessions));
  const weekSets = $derived(
    weekSessions.reduce((n, s) => n + s.blocks.flatMap((b) => b.items).flatMap((i) => i.sets).filter((x) => x.type !== 'warmup').length, 0),
  );

  function start(r?: Routine) {
    startWorkout(r?.id);
    navigate('/workout');
  }
</script>

<section class="page">
  <header class="page-head">
    <div class="when">
      <span class="mark"><Logo size={30} /></span>
      <p class="muted date">{now.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</p>
      <h1 class="title">{now.toLocaleDateString(undefined, { weekday: 'long' })}</h1>
    </div>
    <GymChip />
  </header>

  {#if app.active}
    <a class="resume surface" href="#/workout">
      <span class="live" aria-hidden="true"></span>
      <span class="grow">
        <span class="h3">{dayOf(app.active.name)} in progress</span>
        <span class="small muted num">{clock(app.now - Date.parse(app.active.startedAt))} elapsed</span>
      </span>
      <span class="btn sm go">Resume</span>
    </a>
  {:else if !next}
    <article class="next surface">
      <h2 class="h2">Plan your first routine</h2>
      <p class="muted">Pick exercises, set reps, rest and progression, and group exercises into supersets. Or just start lifting and log as you go.</p>
      <a class="btn primary block" href="#/routines">Create a routine</a>
      <button class="btn ghost block" onclick={() => start()}><Icon name="plus" /> Start empty workout</button>
      <p class="small faint">Want to look around first? Load sample data from More.</p>
    </article>
  {:else}
    <article class="next surface">
      <div class="next-head">
        <div class="grow">
          <p class="small muted">Up next{planOf(next.name) ? ` · ${planOf(next.name)}` : ''}</p>
          <h2 class="next-name">{dayOf(next.name)}</h2>
        </div>
        <MuscleMap sets={routineSetsPerMuscle(next, exercise)} height={112} />
      </div>
      <button class="btn go block" onclick={() => start(next)}>Start workout</button>
    </article>
  {/if}

  <section class="section">
    <div class="spread">
      <h2 class="h2">This week</h2>
      <span class="small muted">{weekSessions.length} {weekSessions.length === 1 ? 'workout' : 'workouts'}, {weekSets} sets</span>
    </div>
    <ol class="week">
      {#each week as w (w.d.getTime())}
        <li class:today={w.today}>
          <span class="small faint">{w.d.toLocaleDateString(undefined, { weekday: 'narrow' })}</span>
          <span class="day num" class:trained={w.sessions.length > 0}
            style:--c={w.sessions.length ? gymColor(gym(w.sessions[0].gymId)) : undefined}
            aria-label="{w.d.toLocaleDateString(undefined, { weekday: 'long' })}: {w.sessions.length ? w.sessions.map((s) => s.name).join(', ') : 'rest'}">
            {w.d.getDate()}
          </span>
        </li>
      {/each}
    </ol>
  </section>

  {#if !app.active && routines.length}
    <section class="section">
      <h2 class="h2">Other routines</h2>
      <ul class="list">
        {#each others as r (r.id)}
          <li class="spread rline">
            <a class="grow plain" href="#/routines/{encodeURIComponent(r.id)}">
              <span class="h3">{dayOf(r.name)}</span>
              <span class="small muted">{planOf(r.name) ? `${planOf(r.name)} · ` : ''}{r.blocks.flatMap((b) => b.items).length} exercises</span>
            </a>
            <MuscleMap sets={routineSetsPerMuscle(r, exercise)} height={48} />
            <button class="btn sm ghost" onclick={() => start(r)}>Start</button>
          </li>
        {/each}
      </ul>
      <button class="btn ghost block" onclick={() => start()}><Icon name="plus" /> Start empty workout</button>
    </section>
  {/if}

  {#if last}
    <section class="section">
      <h2 class="h2">Last workout</h2>
      <a class="list-link surface pad lastw" href="#/session/{encodeURIComponent(last.id)}">
        <span class="gym-dot" style:background={gymColor(gym(last.gymId))}></span>
        <span class="grow">
          <span class="h3">{dayOf(last.name)}</span>
          <span class="small muted">{planOf(last.name) ? `${planOf(last.name)} · ` : ''}{dayLabel(last.startedAt)} at {gym(last.gymId)?.name}, {tonnes(last.blocks.flatMap((b) => b.items).reduce((t, i) => t + volume(i.sets), 0))} lifted</span>
        </span>
        <Icon name="chevron" />
      </a>
    </section>
  {/if}
</section>

<style>
  .when { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; align-items: center; }
  .when .date { grid-column: 2; }
  .when .title { grid-column: 1 / -1; }
  .mark { grid-row: 1; }
  @media (min-width: 900px) {
    .mark { display: none; }
    .when .date { grid-column: 1 / -1; }
  }
  .date { margin: 0 0 2px; }
  .grow { flex: 1; min-width: 0; display: grid; }
  .plain { text-decoration: none; color: inherit; }

  .resume {
    display: flex; align-items: center; gap: 14px; padding: 16px; text-decoration: none; color: inherit;
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--plate-green) 45%, transparent);
  }
  .live { width: 10px; height: 10px; border-radius: 50%; background: var(--plate-green); animation: pulse 1.6s infinite; }
  @keyframes pulse { 50% { opacity: 0.35; } }

  .next { display: grid; gap: 14px; padding: 20px 18px 18px; }
  .next p { margin: 0; }
  .next-head { display: flex; align-items: center; gap: 12px; --map-body: var(--iron-3); --map-rest: color-mix(in srgb, var(--chalk-faint) 35%, var(--iron-3)); }
  .next-name { font: 700 1.75rem/1.15 var(--font); letter-spacing: -0.01em; overflow-wrap: anywhere; }

  .week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; margin: 0; padding: 0; list-style: none; }
  .week li { display: grid; justify-items: center; gap: 6px; }
  .day {
    position: relative; display: grid; place-items: center; width: 100%; max-width: 44px; aspect-ratio: 1;
    border-radius: 50%; color: var(--chalk-faint); font-size: 1rem; font-weight: 500;
  }
  /* Same marking as the History calendar: lifted surface plus a dot in the gym's colour. */
  .day.trained { background: var(--iron-3); color: var(--chalk); }
  .day.trained::after {
    content: ''; position: absolute; bottom: 5px; left: 50%; width: 5px; height: 5px; margin-left: -2.5px;
    border-radius: 50%; background: var(--c);
  }
  .today .day { box-shadow: inset 0 0 0 1.5px var(--chalk-dim); color: var(--chalk); }

  .rline { min-height: 64px; }
  .lastw { border-radius: var(--r-lg); }
</style>

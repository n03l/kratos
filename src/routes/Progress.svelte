<script lang="ts">
  import Chart from '../lib/components/Chart.svelte';
  import Icon from '../lib/components/Icon.svelte';
  import Sheet from '../lib/components/Sheet.svelte';
  import { addBodyEntry, db, exercise, gym, historyByExercise } from '../lib/store.svelte';
  import { dayLabel } from '../lib/format';
  import { formatWeight } from '../lib/logic/training';
  import { recordText, sessionRecords } from '../lib/logic/records';
  import { setText } from '../lib/format';
  import type { BodyEntry } from '../lib/model';
  import { setsPerMuscle } from '../lib/logic/muscles';
  import Sparkline from '../lib/components/Sparkline.svelte';
  import { mainLifts } from '../lib/logic/strength';
  import { workoutStats } from '../lib/logic/stats';
  import { tonnes } from '../lib/format';

  const body = $derived(db().body);
  const stats = $derived(workoutStats(db().sessions, Date.now()));
  const lifts = $derived(mainLifts(historyByExercise(), db().exercises, Date.now()));
  const weights = $derived(body.filter((b) => b.weight !== undefined));
  const latest = $derived(weights.at(-1));
  const monthAgo = $derived.by(() => {
    if (!latest) return undefined;
    const cutoff = Date.parse(latest.date) - 28 * 86_400_000;
    return weights.findLast((b) => Date.parse(b.date) <= cutoff);
  });
  const change = $derived(latest && monthAgo ? latest.weight! - monthAgo.weight! : null);

  const measures = [['waist', 'Waist'], ['chest', 'Chest'], ['arm', 'Arm'], ['thigh', 'Thigh']] as const;
  const latestMeasure = (k: (typeof measures)[number][0]) => body.findLast((b) => b[k] !== undefined);

  // Hard sets per muscle over the last 7 days; an exercise counts fully for every muscle it lists.
  const muscleSets = $derived.by(() => {
    const since = Date.now() - 7 * 86_400_000;
    const items = db().sessions.filter((s) => Date.parse(s.startedAt) >= since).flatMap((s) => s.blocks.flatMap((b) => b.items));
    return [...setsPerMuscle(items, exercise)].sort((a, b) => b[1] - a[1]);
  });
  const maxSets = $derived(Math.max(1, ...muscleSets.map(([, n]) => n)));

  const recent = $derived(
    db().sessions.slice(0, 12).flatMap((s) => sessionRecords(s, db().sessions, db().exercises, historyByExercise()).map((r) => ({ r, s }))).slice(0, 8),
  );

  let logging = $state(false);
  let entry = $state<BodyEntry>({ date: new Date().toISOString().slice(0, 10) });

  function save() {
    const clean: BodyEntry = { date: entry.date };
    for (const k of ['weight', 'waist', 'chest', 'arm', 'thigh'] as const) {
      const v = entry[k];
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) clean[k] = v;
    }
    addBodyEntry(clean);
    logging = false;
    entry = { date: new Date().toISOString().slice(0, 10) };
  }
</script>

<section class="page">
  <header class="page-head">
    <h1 class="title">Progress</h1>
  </header>

  <dl class="tiles">
    <div><dt>Workouts</dt><dd class="num">{stats.total}</dd></div>
    <div><dt>This month</dt><dd class="num">{stats.thisMonth}</dd></div>
    <div><dt>Week streak</dt><dd class="num">{stats.weekStreak}</dd></div>
    <div><dt>Lifted in total</dt><dd class="num">{tonnes(stats.liftedKg)}</dd></div>
  </dl>

  <section class="surface pad stack">
    <div class="bw">
      <div class="spread">
        <h2 class="h3">Body weight{#if latest}<span class="small muted when">· {dayLabel(latest.date)}</span>{/if}</h2>
        <button class="btn sm" onclick={() => (logging = true)} aria-label="Log body weight"><Icon name="plus" size={18} /> Log</button>
      </div>
      <p class="reading">
        <span class="hero num">{latest ? formatWeight(latest.weight!) : '–'}<span class="unit">kg</span></span>
        {#if change !== null}
          <span class="small muted"><span class="num delta">{change > 0 ? '+' : change < 0 ? '−' : '±'}{Math.abs(change).toFixed(1)} kg</span> in 4 weeks</span>
        {/if}
      </p>
    </div>
    <Chart title="Body weight" showTitle={false} points={weights.map((b) => ({ x: Date.parse(b.date), y: b.weight! }))} height={160} />
  </section>

  {#if lifts.length}
    <section class="section">
      <div class="spread"><h2 class="h2">Strength</h2><span class="small muted">Estimated max, 12 weeks</span></div>
      <ul class="list lifts">
        {#each lifts as l (l.exercise.id)}
          <li>
            <a class="lift" href="#/exercises/{encodeURIComponent(l.exercise.id)}"
              aria-label="{l.exercise.name}: estimated max {l.latest.toFixed(1)} kg, {l.change >= 0 ? 'up' : 'down'} {Math.abs(l.change).toFixed(1)} kg in 4 weeks">
              <span class="lname">{l.exercise.name}</span>
              <Sparkline points={l.points} />
              <span class="lval">
                <span class="num lnum">{l.latest.toFixed(1)}<span class="lunit">kg</span></span>
                <span class="num small muted">{l.change > 0 ? '+' : l.change < 0 ? '−' : '±'}{Math.abs(l.change).toFixed(1)} in 4 wk</span>
              </span>
            </a>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  <section class="section">
    <h2 class="h2">Measurements</h2>
    <dl class="measures">
      {#each measures as [k, label] (k)}
        {@const m = latestMeasure(k)}
        <div><dt>{label}</dt><dd class="num">{m ? `${m[k]} cm` : '–'}</dd>{#if m}<p class="small faint">{dayLabel(m.date)}</p>{/if}</div>
      {/each}
    </dl>
  </section>

  <section class="section">
    <div class="spread"><h2 class="h2">Sets per muscle</h2><span class="small muted">Last 7 days</span></div>
    <ul class="bars">
      {#each muscleSets as [m, n] (m)}
        <li>
          <span class="mname">{m}</span>
          <span class="track"><span class="fill" style:width="{(n / maxSets) * 100}%"></span></span>
          <span class="num count">{n}</span>
        </li>
      {/each}
    </ul>
  </section>

  <section class="section">
    <h2 class="h2">Recent records</h2>
    <ul class="list">
      {#each recent as { r, s } (s.id + r.exerciseId)}
        {@const ex = exercise(r.exerciseId)}
        <li class="rec">
          <Icon name="trophy" size={20} />
          <a class="grow" href="#/exercises/{encodeURIComponent(r.exerciseId)}">
            <span class="h3">{ex?.name}</span>
            <span class="small muted">{recordText(r, ex)}, {dayLabel(s.startedAt)}{ex?.gymSpecific ? ` at ${gym(s.gymId)?.name}` : ''}</span>
          </a>
        </li>
      {:else}
        <li class="muted">Records appear here when you beat an estimated max.</li>
      {/each}
    </ul>
  </section>
</section>

<Sheet bind:open={logging} title="Log body weight">
  <form class="stack" onsubmit={(e) => { e.preventDefault(); save(); }}>
    <div class="two">
      <label class="field"><span>Date</span><input autocomplete="off" class="input" type="date" bind:value={entry.date} required /></label>
      <label class="field"><span>Weight (kg)</span><input autocomplete="off" class="input num" type="number" inputmode="decimal" step="0.1" min="20" max="400" bind:value={entry.weight} /></label>
    </div>
    <p class="small muted">Measurements are optional, in centimetres.</p>
    <div class="two">
      {#each measures as [k, label] (k)}
        <label class="field"><span>{label}</span><input autocomplete="off" class="input num" type="number" inputmode="decimal" step="0.1" min="1" max="300" bind:value={entry[k]} /></label>
      {/each}
    </div>
    <button class="btn primary block">Save entry</button>
  </form>
</Sheet>

<style>
  .tiles { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin: 0; }
  .tiles div { display: grid; gap: 4px; padding: 14px 16px; border-radius: var(--r-lg); background: var(--iron-1); }
  .tiles dd { font-size: 1.875rem; font-weight: 700; line-height: 1.1; letter-spacing: -0.01em; }
  .when { margin-left: 6px; font-weight: 400; }
  .bw { display: grid; gap: 6px; }
  .reading { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 14px; margin: 0; }
  .hero { font-size: 2.75rem; font-weight: 600; line-height: 1; letter-spacing: -0.02em; }
  .unit { font-size: 1.125rem; margin-left: 4px; color: var(--chalk-dim); font-weight: 500; letter-spacing: 0; }
  .delta { color: var(--chalk); font-weight: 600; }
  .measures { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 0; }
  .measures div { padding: 12px; border-radius: var(--r-md); background: var(--iron-1); }
  .measures p { margin: 0; }
  dt { font-size: 0.9375rem; color: var(--chalk-dim); }
  dd { margin: 0; font-size: 1.3rem; font-weight: 600; white-space: nowrap; }
  .lift {
    display: grid; grid-template-columns: minmax(0, 1.3fr) minmax(56px, 1fr) auto; align-items: center; gap: 12px;
    min-height: 60px; padding: 8px 0; color: inherit; text-decoration: none;
  }
  .lname { overflow-wrap: anywhere; }
  .lval { display: grid; justify-items: end; line-height: 1.2; }
  .lnum { font-size: 1.15rem; font-weight: 600; }
  .lunit { margin-left: 3px; font-size: 0.875rem; font-weight: 500; color: var(--chalk-dim); }
  .bars { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
  .bars li { display: grid; grid-template-columns: 96px 1fr 28px; align-items: center; gap: 10px; }
  .mname { text-transform: capitalize; color: var(--chalk-dim); font-size: 0.95rem; }
  .track { height: 12px; border-radius: 0 4px 4px 0; background: var(--iron-1); }
  .fill { display: block; height: 100%; min-width: 2px; border-radius: 0 4px 4px 0; background: var(--chalk-dim); }
  .count { text-align: right; font-weight: 600; font-size: 1.05rem; }
  .rec { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; }
  .rec :global(svg) { flex: none; color: var(--plate-yellow); margin-top: 2px; }
  .grow { display: grid; min-width: 0; text-decoration: none; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  @media (max-width: 420px) { .measures { grid-template-columns: repeat(2, 1fr); } }
</style>

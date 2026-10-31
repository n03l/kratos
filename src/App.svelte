<script lang="ts">
  import Icon, { type IconName } from './lib/components/Icon.svelte';
  import Logo from './lib/components/Logo.svelte';
  import RestBar from './lib/components/RestBar.svelte';
  import SyncNotice from './lib/components/SyncNotice.svelte';
  import { app, init } from './lib/store.svelte';
  import { match, route } from './lib/router.svelte';
  import Today from './routes/Today.svelte';
  import Workout from './routes/Workout.svelte';
  import SessionView from './routes/SessionView.svelte';
  import History from './routes/History.svelte';
  import Exercises from './routes/Exercises.svelte';
  import ExerciseDetail from './routes/ExerciseDetail.svelte';
  import Routines from './routes/Routines.svelte';
  import RoutineEdit from './routes/RoutineEdit.svelte';
  import Progress from './routes/Progress.svelte';
  import More from './routes/More.svelte';
  import GymEdit from './routes/GymEdit.svelte';

  const ready = init();

  const tabs: { path: string; label: string; icon: IconName }[] = [
    { path: '/', label: 'Today', icon: 'today' },
    { path: '/history', label: 'History', icon: 'history' },
    { path: '/exercises', label: 'Exercises', icon: 'exercises' },
    { path: '/progress', label: 'Progress', icon: 'progress' },
    { path: '/more', label: 'More', icon: 'more' },
  ];

  const section = $derived(
    route.path === '/workout' ? '/' : (tabs.slice(1).find((t) => route.path.startsWith(t.path))?.path ??
      (route.path.startsWith('/session') ? '/history' : route.path.startsWith('/done') ? '/' : route.path.startsWith('/routines') || route.path.startsWith('/gyms') ? '/more' : '/')),
  );
</script>

<div class="shell">
  <nav class="tabs" aria-label="Main">
    <span class="brand" aria-hidden="true"><Logo size={30} /> Kratos</span>
    {#each tabs as t (t.path)}
      <a href="#{t.path}" class="tab" aria-current={section === t.path ? 'page' : undefined}>
        <Icon name={t.icon} />
        <span>{t.label}</span>
        {#if t.path === '/' && app.active}<span class="live" aria-label="Workout in progress"></span>{/if}
      </a>
    {/each}
  </nav>

  <main class:with-rest={!!app.rest}>
    {#if app.storageError}
      <p class="storage-error small" role="alert">{app.storageError} <a href="#/more">Data settings</a></p>
    {/if}
    {#await ready}
      <p class="muted loading">Loading…</p>
    {:then}
      <SyncNotice />
      {#key route.path}
        {#if route.path === '/'}<Today />
        {:else if route.path === '/workout'}<Workout />
        {:else if match('/session/:id')}<SessionView id={match('/session/:id')!.id} />
        {:else if match('/done/:id')}<SessionView id={match('/done/:id')!.id} saved />
        {:else if route.path === '/history'}<History />
        {:else if route.path === '/exercises'}<Exercises />
        {:else if match('/exercises/:id')}<ExerciseDetail id={match('/exercises/:id')!.id} />
        {:else if route.path === '/routines'}<Routines />
        {:else if match('/routines/:id')}<RoutineEdit id={match('/routines/:id')!.id} />
        {:else if route.path === '/progress'}<Progress />
        {:else if route.path === '/more'}<More />
        {:else if match('/gyms/:id')}<GymEdit id={match('/gyms/:id')!.id} />
        {:else}
          <section class="page">
            <h1 class="title">Page not found</h1>
            <p class="muted">There is nothing at this address.</p>
            <a class="btn primary" href="#/">Go to Today</a>
          </section>
        {/if}
      {/key}
    {:catch err}
      <p class="loading">Could not load your data: {err.message}</p>
    {/await}
  </main>

  <RestBar />
</div>

<style>
  .shell { min-height: 100dvh; }
  main {
    max-width: 560px;
    margin: 0 auto;
    padding: calc(16px + env(safe-area-inset-top, 0px)) 16px calc(var(--nav-h) + var(--safe-b) + 32px);
  }
  main.with-rest { padding-bottom: calc(var(--nav-h) + var(--safe-b) + 132px); }
  .loading { padding: 40px 0; }
  .storage-error {
    margin: 0 0 16px; padding: 10px 12px; border-radius: var(--r-sm);
    background: color-mix(in srgb, var(--plate-red) 14%, transparent); color: var(--ink-red); overflow-wrap: anywhere;
  }

  .tabs {
    position: fixed;
    inset: auto 0 0 0;
    z-index: 30;
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    height: calc(var(--nav-h) + var(--safe-b));
    padding-bottom: var(--safe-b);
    border-top: 1px solid var(--line);
    background: color-mix(in srgb, var(--iron-0) 92%, transparent);
    backdrop-filter: blur(12px);
  }
  .brand { display: none; }
  .tab {
    position: relative;
    display: grid;
    place-items: center;
    align-content: center;
    gap: 2px;
    color: var(--chalk-faint);
    text-decoration: none;
    font-size: 0.8125rem;
    font-weight: 500;
  }
  .tab[aria-current='page'] { color: var(--chalk); }
  .live {
    position: absolute; top: 10px; left: calc(50% + 9px);
    width: 8px; height: 8px; border-radius: 50%; background: var(--plate-green);
    box-shadow: 0 0 0 2px var(--iron-0);
  }

  @media (min-width: 900px) {
    .tabs {
      inset: 0 auto 0 0;
      width: 240px;
      height: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 24px 16px;
      border-top: 0;
      border-right: 1px solid var(--line);
    }
    .brand { display: flex; align-items: center; gap: 10px; padding: 0 12px 20px; font-size: 1.75rem; font-weight: 700; color: var(--chalk); }
    .tab {
      display: flex; gap: 12px; min-height: 44px; padding: 0 12px;
      border-radius: var(--r-md); font-size: 0.95rem;
    }
    .tab[aria-current='page'] { background: var(--iron-1); }
    .live { position: static; margin-left: auto; }
    .shell { padding-left: 240px; }
    /* Content sits beside the sidebar rather than floating in the middle of the window. */
    main { max-width: 640px; margin: 0 0 0 clamp(32px, 5vw, 80px); padding-top: 40px; padding-bottom: 120px; }
    main.with-rest { padding-bottom: 140px; }
  }
</style>

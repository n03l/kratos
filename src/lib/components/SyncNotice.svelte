<script lang="ts">
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import { app, db, resolveConflict, syncNow } from '../store.svelte';
  import { route } from '../router.svelte';
  import type { Snapshot } from '../model';

  let open = $state(false);
  const remote = $derived(app.sync.remote?.data);
  const firstSync = $derived(!app.sync.state?.hash);

  const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;
  const counts = (s: Pick<Snapshot, 'sessions' | 'routines'>) => `${plural(s.sessions.length, 'workout')}, ${plural(s.routines.length, 'routine')}`;

  async function choose(choice: 'merge' | 'drive' | 'device') {
    await resolveConflict(choice);
    if (app.sync.status !== 'conflict') open = false;
  }
</script>

{#if app.sync.status === 'conflict'}
  <div class="notice small" role="status">
    <Icon name="cloud" size={18} />
    <span class="grow">{firstSync ? 'Google Drive already has Kratos data.' : 'Drive has changes from another device.'}</span>
    <button class="btn sm ghost" onclick={() => (open = true)}>Review</button>
  </div>
{:else if route.path === '/' && !app.active && (app.sync.status === 'signin' || app.sync.status === 'error')}
  <div class="notice small" role="status">
    <Icon name="cloud" size={18} />
    <span class="grow">{app.sync.status === 'error' ? app.sync.message : 'Drive sync is waiting for you to sign in.'}</span>
    <button class="btn sm ghost" onclick={() => syncNow(true)}>{app.sync.status === 'error' ? 'Try again' : 'Sync now'}</button>
  </div>
{/if}

<Sheet bind:open title={firstSync ? 'Data on Drive and here' : 'Both changed'}>
  {#if remote}
    <div class="stack">
      <p class="muted">
        {firstSync ? 'Google Drive and this device both have Kratos data.' : 'This device and Google Drive both changed since the last sync.'}
        Drive has {counts(remote)}; this device has {counts(db())}.
      </p>
      <button class="btn primary block" disabled={app.sync.status === 'syncing'} onclick={() => choose('merge')}>Merge both</button>
      <p class="small faint">Adds Drive’s workouts, routines, exercises and body entries that aren’t here, then saves the result to Drive. Edits to things both sides have keep this device’s version.</p>
      <button class="btn ghost block" disabled={app.sync.status === 'syncing' || !!app.active} onclick={() => choose('drive')}>Use Drive’s copy</button>
      <p class="small faint">{app.active ? 'Finish or discard the workout in progress to use this.' : 'Replaces everything on this device with Drive’s data.'}</p>
      <button class="btn danger block" disabled={app.sync.status === 'syncing'} onclick={() => choose('device')}>Keep this device’s</button>
      <p class="small faint">Replaces Drive’s data with this device’s. Drive keeps earlier versions of the file for 30 days.</p>
      {#if app.sync.message}<p class="error small" role="alert">{app.sync.message}</p>{/if}
    </div>
  {/if}
</Sheet>

<style>
  .notice {
    display: flex; align-items: center; gap: 10px; margin: 0 0 16px; padding: 8px 8px 8px 12px;
    border: 1px solid var(--line); border-radius: var(--r-md); background: var(--iron-1); color: var(--chalk-dim);
  }
  .notice :global(svg) { flex: none; }
  .grow { flex: 1; min-width: 0; overflow-wrap: anywhere; }
  .notice .btn { flex: none; }
  p { margin: 0; }
  .error { padding: 10px 12px; border-radius: var(--r-sm); background: color-mix(in srgb, var(--plate-red) 14%, transparent); color: var(--ink-red); overflow-wrap: anywhere; }
  .btn:disabled { opacity: 0.45; }
</style>

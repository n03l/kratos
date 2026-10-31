<script lang="ts">
  import Icon from './Icon.svelte';
  import { app, connectDrive, disconnectDrive, driveAvailable, syncNow } from '../store.svelte';

  const busy = $derived(app.sync.status === 'syncing');

  function when(iso: string): string {
    const d = new Date(iso);
    const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${time}`;
  }

  const status = $derived.by(() => {
    const s = app.sync;
    if (s.status === 'syncing') return 'Syncing…';
    if (s.status === 'conflict') return 'Drive and this device both changed. Review it at the top of the page.';
    if (s.status === 'signin') return 'Sign in to sync. Google asks again about every hour.';
    if (s.state?.syncedAt) return `Synced ${when(s.state.syncedAt)}`;
    return 'Not synced yet.';
  });
</script>

<div class="group">
  <h3 class="h3">Google Drive</h3>
  {#if !driveAvailable}
    <p class="small faint">Drive sync isn’t set up in this build.</p>
  {:else if !isSecureContext}
    <p class="small faint">Drive sync needs a secure connection: open the app over HTTPS or on localhost.</p>
  {:else if !app.sync.state}
    <p class="small faint">Keep a copy in a “Kratos data.json” file in your Drive and use the same data on other devices. Kratos can only see files it created.</p>
    <button class="btn ghost block" onclick={connectDrive}><Icon name="cloud" /> Connect Google Drive</button>
  {:else}
    <p class="small muted" role="status">{status}</p>
    <div class="two">
      <button class="btn ghost" disabled={busy} onclick={() => syncNow(true)}><Icon name="cloud" /> Sync now</button>
      <button class="btn ghost" disabled={busy} onclick={disconnectDrive}>Disconnect</button>
    </div>
    <p class="small faint">Syncs after changes and when a workout ends. The workout in progress stays on this device until you finish it. Disconnecting keeps the file in Drive.</p>
  {/if}
  {#if app.sync.message && app.sync.status !== 'conflict'}<p class="error small" role="alert">{app.sync.message}</p>{/if}
</div>

<style>
  .group { display: grid; gap: 8px; margin-top: 8px; }
  .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .two .btn { padding: 0 10px; }
  p { margin: 0; }
  .error { padding: 10px 12px; border-radius: var(--r-sm); background: color-mix(in srgb, var(--plate-red) 14%, transparent); color: var(--ink-red); overflow-wrap: anywhere; }
  .btn:disabled { opacity: 0.45; }
  @media (max-width: 380px) { .two { grid-template-columns: 1fr; } }
</style>

<script lang="ts">
  import DriveSync from './DriveSync.svelte';
  import Icon from './Icon.svelte';
  import Sheet from './Sheet.svelte';
  import { app, db, mergeData, replaceData } from '../store.svelte';
  import { downloadJson, today } from '../download';
  import { buildExport, isEmpty, planMerge, type MergePick, type MergeSummary } from '../logic/merge';
  import type { ExportFile, Snapshot } from '../model';
  import { ImportError, MAX_IMPORT_BYTES, parseBackup, parseExport } from '../repo/validate';
  import { seed } from '../repo/mock';
  import { starter } from '../repo/starter';
  import { persistStorage, storage } from '../storage.svelte';

  let error = $state('');
  let done = $state('');

  // Restore (replace everything) and import (merge) each read a file through their own picker.
  let restoreInput = $state<HTMLInputElement>();
  let importInput = $state<HTMLInputElement>();

  async function readPicked(e: Event): Promise<{ name: string; text: string } | null> {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    error = '';
    done = '';
    if (!file) return null;
    if (file.size > MAX_IMPORT_BYTES) {
      error = `${file.name} is larger than 20 MB, too big to be a Kratos file.`;
      return null;
    }
    return { name: file.name, text: await file.text() };
  }

  function explain(err: unknown, name: string) {
    error = err instanceof ImportError ? `Couldn't import ${name}: ${err.message}` : `Couldn't read ${name}.`;
  }

  // Restore from backup: replaces everything.
  let restoring = $state.raw<Snapshot | null>(null);
  let restoreOpen = $state(false);

  async function pickRestore(e: Event) {
    const f = await readPicked(e);
    if (!f) return;
    try {
      restoring = parseBackup(f.text);
      restoreOpen = true;
    } catch (err) {
      explain(err, f.name);
    }
  }

  async function applyRestore() {
    if (!restoring) return;
    await replaceData(restoring);
    restoreOpen = false;
    restoring = null;
    // A refused save (see the store) explains itself in app.storageError.
    if (!app.storageError) done = 'Backup restored.';
  }

  // Import: merges a file into what's here, skipping anything already present.
  // Raw, not reactive: the file is never edited, and planMerge clones it (proxies can't be cloned).
  let incoming = $state.raw<ExportFile | null>(null);
  let incomingName = $state('');
  let importOpen = $state(false);
  let pick = $state<MergePick>({ routines: true, exercises: true, sessions: true, body: true });
  const plan = $derived(incoming ? planMerge($state.snapshot(db()), incoming, { ...pick }) : null);

  async function pickImport(e: Event) {
    const f = await readPicked(e);
    if (!f) return;
    try {
      incoming = parseExport(f.text);
      incomingName = f.name;
      pick = {
        routines: incoming.routines.length > 0,
        exercises: incoming.exercises.length > 0,
        sessions: incoming.sessions.length > 0,
        body: incoming.body.length > 0,
      };
      importOpen = true;
    } catch (err) {
      explain(err, f.name);
    }
  }

  async function applyImport() {
    if (!plan || isEmpty(plan.summary) || plan.overLimit) return;
    const summary = plan.summary;
    await mergeData(plan.next);
    importOpen = false;
    incoming = null;
    if (!app.storageError) done = `Imported ${describe(summary)}.`;
  }

  const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

  function describe(s: MergeSummary): string {
    const parts = [
      s.routinesAdded.length && plural(s.routinesAdded.length, 'routine'),
      s.sessionsAdded && plural(s.sessionsAdded, 'workout'),
      s.exercisesAdded.length && plural(s.exercisesAdded.length, 'exercise'),
      s.bodyAdded && plural(s.bodyAdded, 'body entry', 'body entries'),
      s.gymsAdded.length && plural(s.gymsAdded.length, 'gym'),
    ].filter(Boolean) as string[];
    return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? 'nothing');
  }

  // Export: chosen sections plus what they refer to.
  let exportOpen = $state(false);
  let exp = $state({ routines: true, exercises: false, sessions: true, body: true });

  function downloadExport() {
    downloadJson(`kratos-export-${today()}.json`, buildExport($state.snapshot(db()), exp));
    exportOpen = false;
    done = 'Export downloaded.';
  }

  function downloadBackup() {
    downloadJson(`kratos-backup-${today()}.json`, $state.snapshot(db()));
    done = 'Backup downloaded.';
  }

  // Sample data and erase.
  let confirm = $state<'sample' | 'erase' | null>(null);
  let confirmOpen = $state(false);

  async function applyConfirm() {
    await replaceData(confirm === 'sample' ? seed() : starter());
    if (!app.storageError) done = confirm === 'sample' ? 'Sample data loaded.' : 'All data erased.';
    confirmOpen = false;
  }

  const counts = (s: Pick<Snapshot, 'sessions' | 'routines' | 'exercises' | 'gyms'>) =>
    `${plural(s.sessions.length, 'workout')}, ${plural(s.routines.length, 'routine')}, ${plural(s.exercises.length, 'exercise')}, ${plural(s.gyms.length, 'gym')}`;
</script>

{#if app.storageError}
  <p class="error small" role="alert">{app.storageError}</p>
{:else}
  <p class="muted small">{app.sync.state ? 'Saved on this device and synced with Google Drive.' : 'Saved on this device only. Clearing this site’s data in the browser deletes it, so connect Google Drive or download a backup now and then.'}</p>
  <ul class="list">
    <li>
      {#if storage.persisted}
        <div class="list-link">
          <span class="grow"><span class="h3">Storage</span><span class="small muted">Kept on this device even when it runs low on space.</span></span>
        </div>
      {:else if !storage.supported}
        <div class="list-link">
          <span class="grow"><span class="h3">Storage</span><span class="small muted">{isSecureContext ? 'This browser can’t keep data safe from clean-ups when space runs low.' : 'Needs a secure connection to keep data safe from clean-ups: open the app over HTTPS or on localhost.'}</span></span>
        </div>
      {:else}
        <button class="list-link" onclick={persistStorage} disabled={storage.busy}>
          <span class="grow"><span class="h3">Storage</span><span class="small muted">{storage.persisted === null ? 'Checking…' : 'The browser may clear Kratos data when the device runs low on space. Install Kratos to the home screen, then tap to ask again.'}</span></span>
          <span class="btn sm ghost">Ask again</span>
        </button>
      {/if}
    </li>
  </ul>
{/if}

<DriveSync />

<ul class="list files">
  <li>
    <button class="list-link" onclick={() => importInput?.click()}>
      <Icon name="up" />
      <span class="grow"><span class="h3">Import from file</span><span class="small muted">Add routines, exercises, workouts or body entries from a Kratos file. Anything you already have is skipped.</span></span>
    </button>
  </li>
  <li>
    <button class="list-link" onclick={() => (exportOpen = true)}>
      <Icon name="download" />
      <span class="grow"><span class="h3">Export…</span><span class="small muted">Pick what to save to a file to share or import elsewhere</span></span>
    </button>
  </li>
  <li>
    <button class="list-link" onclick={downloadBackup}>
      <Icon name="archive" />
      <span class="grow"><span class="h3">Download backup</span><span class="small muted">Everything, in one file</span></span>
    </button>
  </li>
  <li>
    <button class="list-link" onclick={() => restoreInput?.click()}>
      <Icon name="history" />
      <span class="grow"><span class="h3">Restore backup</span><span class="small muted">Replaces everything on this device with the backup</span></span>
    </button>
  </li>
  <li>
    <button class="list-link" onclick={() => { confirm = 'sample'; confirmOpen = true; }}>
      <Icon name="exercises" />
      <span class="grow"><span class="h3">Load sample data</span><span class="small muted">Synthetic gyms, routines and 12 weeks of workouts, to look around</span></span>
    </button>
  </li>
  <li>
    <button class="list-link destructive" onclick={() => { confirm = 'erase'; confirmOpen = true; }}>
      <Icon name="trash" />
      <span class="grow"><span class="h3">Erase all data</span></span>
    </button>
  </li>
</ul>
<input bind:this={importInput} class="sr-only" type="file" accept=".json,application/json" onchange={pickImport} aria-label="File to import" tabindex="-1" />
<input bind:this={restoreInput} class="sr-only" type="file" accept=".json,application/json" onchange={pickRestore} aria-label="Backup file to restore" tabindex="-1" />

{#if error}<p class="error small" role="alert">{error}</p>{/if}
{#if done}<p class="ok small" role="status">{done}</p>{/if}

<Sheet bind:open={importOpen} title="Import from {incomingName}">
  {#if incoming && plan}
    {@const s = plan.summary}
    <div class="stack">
      <ul class="list picks">
        {#if incoming.routines.length}
          <li>
            <label class="pick">
              <input type="checkbox" bind:checked={pick.routines} />
              <span class="grow">
                <span class="h3">Routines</span>
                <span class="small muted">{pick.routines ? `${s.routinesAdded.length} new${s.routinesSkipped.length ? `, ${s.routinesSkipped.length} already here` : ''}` : `${incoming.routines.length} in file`}</span>
                {#if pick.routines && s.routinesAdded.length}<span class="small names">{s.routinesAdded.join(', ')}</span>{/if}
              </span>
            </label>
          </li>
        {/if}
        {#if incoming.sessions.length}
          <li>
            <label class="pick">
              <input type="checkbox" bind:checked={pick.sessions} />
              <span class="grow">
                <span class="h3">Workouts</span>
                <span class="small muted">{pick.sessions ? `${s.sessionsAdded} new${s.sessionsSkipped ? `, ${s.sessionsSkipped} already here` : ''}` : `${incoming.sessions.length} in file`}</span>
                {#if pick.sessions && s.gymsAdded.length}<span class="small names">Adds {plural(s.gymsAdded.length, 'gym')}: {s.gymsAdded.join(', ')}</span>{/if}
              </span>
            </label>
          </li>
        {/if}
        {#if incoming.exercises.length}
          <li>
            <label class="pick">
              <input type="checkbox" bind:checked={pick.exercises} />
              <span class="grow">
                <span class="h3">Exercises</span>
                <span class="small muted">
                  {s.exercisesAdded.length} new, {s.exercisesMatched} already here{pick.exercises ? '' : ' (only those the routines and workouts use)'}
                </span>
                {#if s.exercisesAdded.length}<span class="small names">{s.exercisesAdded.join(', ')}</span>{/if}
              </span>
            </label>
          </li>
        {/if}
        {#if incoming.body.length}
          <li>
            <label class="pick">
              <input type="checkbox" bind:checked={pick.body} />
              <span class="grow">
                <span class="h3">Body weight and measurements</span>
                <span class="small muted">{pick.body ? `${s.bodyAdded} new${s.bodySkipped ? `, ${s.bodySkipped} dates already here` : ''}` : `${incoming.body.length} in file`}</span>
              </span>
            </label>
          </li>
        {/if}
      </ul>
      {#if app.active}<p class="small faint">Your workout in progress is kept.</p>{/if}
      {#if plan.overLimit}<p class="error small" role="alert">{plan.overLimit}</p>{/if}
      <button class="btn primary block" disabled={isEmpty(s) || !!plan.overLimit} onclick={applyImport}>
        {isEmpty(s) ? 'Nothing new to import' : `Import ${describe(s)}`}
      </button>
    </div>
  {/if}
</Sheet>

<Sheet bind:open={exportOpen} title="Export">
  <div class="stack">
    <p class="small muted">A file you can import on another device or share. Exercises and gyms the routines and workouts use are always included. Settings aren't.</p>
    <ul class="list picks">
      <li><label class="pick"><input type="checkbox" bind:checked={exp.routines} /><span class="grow"><span class="h3">Routines</span><span class="small muted">{plural(db().routines.length, 'routine')}</span></span></label></li>
      <li><label class="pick"><input type="checkbox" bind:checked={exp.sessions} /><span class="grow"><span class="h3">Workouts</span><span class="small muted">{plural(db().sessions.length, 'workout')}</span></span></label></li>
      <li><label class="pick"><input type="checkbox" bind:checked={exp.exercises} /><span class="grow"><span class="h3">All exercises</span><span class="small muted">{plural(db().exercises.length, 'exercise')}, including unused ones</span></span></label></li>
      <li><label class="pick"><input type="checkbox" bind:checked={exp.body} /><span class="grow"><span class="h3">Body weight and measurements</span><span class="small muted">{plural(db().body.length, 'entry', 'entries')}</span></span></label></li>
    </ul>
    <button class="btn primary block" disabled={!exp.routines && !exp.sessions && !exp.exercises && !exp.body} onclick={downloadExport}>
      <Icon name="download" /> Download export
    </button>
  </div>
</Sheet>

<Sheet bind:open={restoreOpen} title="Restore this backup?">
  {#if restoring}
    <div class="stack">
      <p>The backup has {counts(restoring)}.</p>
      <p class="muted small">It replaces everything on this device: {counts(db())}{app.active ? ', and the workout in progress' : ''}{app.sync.state ? ', and then the copy in Google Drive' : ''}. To add data instead, use Import from file.</p>
      <button class="btn primary block" onclick={applyRestore}>Replace with backup</button>
      <button class="btn ghost block" onclick={() => (restoreOpen = false)}>Cancel</button>
    </div>
  {/if}
</Sheet>

<Sheet bind:open={confirmOpen} title={confirm === 'sample' ? 'Load sample data?' : 'Erase all data?'}>
  <div class="stack">
    <p class="muted">
      {confirm === 'sample'
        ? 'Sample gyms, routines and 12 weeks of made-up workouts replace your data on this device.'
        : 'Every workout, routine, exercise and gym on this device is deleted. You start again with one gym and the standard exercises.'}
      Your current data has {counts(db())}.
      {#if app.sync.state}The copy in Google Drive is replaced too on the next sync.{/if}
    </p>
    <button class="btn block {confirm === 'erase' ? 'danger' : 'primary'}" onclick={applyConfirm}>
      {confirm === 'sample' ? 'Replace with sample data' : 'Erase all data'}
    </button>
    <button class="btn ghost block" onclick={() => (confirmOpen = false)}>Cancel</button>
  </div>
</Sheet>

<style>
  .files { margin-top: 4px; border-top: 1px solid var(--line); }
  .error { margin: 0; padding: 10px 12px; border-radius: var(--r-sm); background: color-mix(in srgb, var(--plate-red) 14%, transparent); color: var(--ink-red); overflow-wrap: anywhere; }
  .ok { margin: 0; color: var(--ink-green); }
  p { margin: 0; }
  .pick { display: flex; gap: 12px; align-items: flex-start; padding: 12px 0; }
  .pick input { margin-top: 1px; }
  .grow { flex: 1; display: grid; gap: 2px; min-width: 0; }
  .names { color: var(--chalk-dim); overflow-wrap: anywhere; }
  .btn:disabled { opacity: 0.45; }
</style>

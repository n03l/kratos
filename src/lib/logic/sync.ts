import type { Snapshot } from '../model';
import { buildExport, planMerge, type MergePick } from './merge';

/**
 * Syncing one snapshot file with Google Drive. The device keeps the hash of the data and the Drive version
 * it last synced; comparing both with now tells who changed since.
 */

/** What this device last synced. Empty until the first sync after connecting. */
export interface SyncState {
  fileId?: string;
  /** Drive's file version, a counter that grows with every change. */
  version?: string;
  /** hashText of the snapshot as it was synced. */
  hash?: string;
  syncedAt?: string;
  /** Drive's permission id for the Google account synced with; signing in as another one is refused. */
  account?: string;
}

export interface RemoteFile {
  id: string;
  version: string;
}

export type SyncAction = 'create' | 'push' | 'pull' | 'conflict' | 'none';

/**
 * `localEmpty`: nothing worth keeping here. On a device that never synced (a fresh install) Drive's copy can
 * simply be taken; after a sync, empty data means it was erased, which must not be undone without asking.
 */
export function decide(localHash: string, state: SyncState, remote: RemoteFile | null, localEmpty = false): SyncAction {
  if (!remote) return 'create';
  const localChanged = localHash !== state.hash;
  if (remote.id === state.fileId && remote.version === state.version) return localChanged ? 'push' : 'none';
  if (localEmpty && state.hash === undefined) return 'pull';
  return localChanged ? 'conflict' : 'pull';
}

/** A fresh install: no workouts, routines or body entries. */
export const isBlank = (s: Snapshot) => !s.sessions.length && !s.routines.length && !s.body.length;

/** 53-bit string hash (cyrb53). Detects changes, not tampering; needs no secure context. */
export function hashText(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * Hash of the data itself, whatever order its fields were set in. Loading rebuilds every object in a fixed
 * field order (parseBackup) while store functions add fields at the end, so the same data can serialise to
 * different text before and after a reload.
 */
export function dataHash(data: unknown): string {
  return hashText(JSON.stringify(data, (_key, value: unknown) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const o = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  }));
}

export type AfterDownload = 'record' | 'push' | 'take' | 'conflict';

/**
 * Settle a pull or conflict once Drive's copy is downloaded. Drive's version counter also moves without
 * anyone editing the file, so Drive's content is compared with what was last synced before calling it changed.
 * - `local`: hash of this device's data when the sync started; `localNow`: after the download.
 * - `remote`: hashes of Drive's copy (its raw text, as an upload from this device recorded it, and its data).
 * - `canTake`: no workout in progress, so Drive's copy may replace the data here.
 */
export function afterDownload(
  action: 'pull' | 'conflict',
  o: { local: string; localNow: string; remote: string[]; synced?: string; canTake: boolean },
): AfterDownload {
  if (o.remote.includes(o.local)) return 'record';
  if (o.synced !== undefined && o.remote.includes(o.synced)) return 'push';
  if (action === 'pull' && o.canTake && o.localNow === o.local) return 'take';
  return 'conflict';
}

const ALL: MergePick = { routines: true, exercises: true, sessions: true, body: true };

/** Both sides' data: this device's, plus whatever Drive has that isn't here. Nothing is deleted. */
export function mergeBoth(local: Snapshot, remote: Snapshot): Snapshot {
  const { next, overLimit } = planMerge(local, buildExport(remote, ALL), ALL);
  if (overLimit) throw new Error(overLimit);
  return next;
}

export const DRIVE_ID = /^[\w-]{1,200}$/;
const VERSION = /^\d{1,20}$/;

/** Check sync state read from the device. Anything unexpected means not connected (null). */
export function parseSyncState(raw: unknown): SyncState | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const field = (key: string, ok: (v: string) => boolean) => {
    const v = Object.hasOwn(o, key) ? o[key] : undefined;
    return typeof v === 'string' && ok(v) ? v : undefined;
  };
  const state: SyncState = {};
  const fileId = field('fileId', (v) => DRIVE_ID.test(v));
  const version = field('version', (v) => VERSION.test(v));
  const hash = field('hash', (v) => /^[0-9a-z]{1,20}$/.test(v));
  const syncedAt = field('syncedAt', (v) => v.length <= 40 && !Number.isNaN(Date.parse(v)));
  const account = field('account', (v) => DRIVE_ID.test(v));
  if (fileId) state.fileId = fileId;
  if (version) state.version = version;
  if (hash) state.hash = hash;
  if (syncedAt) state.syncedAt = syncedAt;
  if (account) state.account = account;
  return state;
}

/** Check a file description from the Drive API. Throws on anything unexpected. */
export function parseRemoteFile(raw: unknown): RemoteFile {
  const o = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const id = Object.hasOwn(o, 'id') ? o.id : undefined;
  const version = Object.hasOwn(o, 'version') ? o.version : undefined;
  if (typeof id !== 'string' || !DRIVE_ID.test(id) || typeof version !== 'string' || !VERSION.test(version)) {
    throw new Error('Drive sent an unexpected file description.');
  }
  return { id, version };
}

import type { SyncState } from '../logic/sync';
import type { Draft, Snapshot } from '../model';

/**
 * Storage boundary. Everything is saved as one snapshot plus the workout in progress; a sync-backed
 * implementation can sit behind the same interface later.
 */
export interface Repo {
  /**
   * Make this tab the one that saves. Kratos open in an older tab or window would otherwise overwrite newer
   * data with what it loaded; once another tab claims, writes from this one fail with OtherTabError.
   */
  claim(): Promise<void>;
  /** False once another tab or window has claimed the data. */
  isWriter(): Promise<boolean>;
  /** The saved snapshot, or null on first launch. */
  load(): Promise<Snapshot | null>;
  save(snapshot: Snapshot): Promise<void>;
  loadDraft(): Promise<Draft | null>;
  saveDraft(draft: Draft | null): Promise<void>;
  /** What was last synced with Google Drive (unchecked), or null when not connected. */
  loadSync(): Promise<unknown>;
  saveSync(state: SyncState | null): Promise<void>;
}

/** Kratos was opened in another tab or window, which now does the saving. */
export class OtherTabError extends Error {
  constructor() {
    super('Kratos is open in another tab or window.');
  }
}

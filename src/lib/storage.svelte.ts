// Ask the browser to keep Kratos's data when the device runs low on space (Storage API). Chrome grants it to
// installed apps without asking, and may refuse a site that hasn't been used much yet.

export const storage = $state({
  /** The API exists (browsers expose it only in a secure context). */
  supported: typeof navigator !== 'undefined' && typeof navigator.storage?.persist === 'function',
  /** null until the browser has answered. */
  persisted: null as boolean | null,
  busy: false,
});

/** Ask for persistent storage once, or again after a refusal. Safe to call repeatedly. */
export async function persistStorage() {
  if (!storage.supported || storage.busy || storage.persisted) return;
  storage.busy = true;
  try {
    storage.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist());
  } catch {
    storage.persisted = false;
  } finally {
    storage.busy = false;
  }
}

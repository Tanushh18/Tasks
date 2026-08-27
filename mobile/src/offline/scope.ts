/**
 * Namespaces on-device storage to the signed-in user.
 *
 * Local data used to live under fixed keys ("dt_offline_queue", "dt_cache_home_dashboard") while
 * the offline queue flushes on app start with whatever session is active. On a shared phone that
 * meant a transaction queued by one account could be posted to the next account that signed in,
 * and one user's cached dashboard figures could be shown to another. Keys are per-user now, so
 * data belonging to a signed-out account is simply unreachable rather than mis-attributed.
 */

let activeUserId: string | null = null;

export function setStorageScope(userId: string | null): void {
  activeUserId = userId;
}

export function getStorageScope(): string | null {
  return activeUserId;
}

/** Per-user form of a base key, or null when nobody is signed in. */
export function scopedKey(baseKey: string): string | null {
  return activeUserId ? `${baseKey}:${activeUserId}` : null;
}

/**
 * Same as `scopedKey`, but refuses to continue without a signed-in user. Used on write paths:
 * silently dropping a queued task or transaction would let the UI report "Saved offline" for
 * something that was never stored.
 */
export function requireScopedKey(baseKey: string): string {
  const key = scopedKey(baseKey);
  if (!key) {
    throw new Error(`Cannot access ${baseKey} while signed out.`);
  }
  return key;
}

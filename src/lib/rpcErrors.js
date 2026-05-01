/**
 * Helpers for handling Supabase RPC errors uniformly across the admin portal.
 *
 * When the underlying SQL migrations have not been applied yet, RPC calls
 * fail with `function does not exist`. We detect those cases so the UI can
 * show a graceful "migrations not applied" banner instead of a hard error.
 */

const FN_NOT_FOUND_CODES = new Set(['42883', 'PGRST202', 'PGRST116'])

export function isMissingFunction(error) {
  if (!error) return false
  if (FN_NOT_FOUND_CODES.has(error.code)) return true
  return /function .* does not exist/i.test(error.message || '')
}

export { FN_NOT_FOUND_CODES }

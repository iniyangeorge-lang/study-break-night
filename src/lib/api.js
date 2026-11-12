// Thin wrappers around the SQL functions in supabase/schema.sql.
// All event rules live in the database. These functions only pass
// arguments through and hand back the { status, ... } object.
//
// Each wrapper throws on network/server errors, so callers should
// try/catch and show a "couldn't connect, try again" message.

import { supabase, configError } from './supabase';

async function call(fn, args) {
  if (!supabase) throw new Error(configError);
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data;
}

/**
 * Sign up for a cup.
 * status: ok (+name) | already_registered | full | closed
 *         | invalid_name | invalid_identifier
 */
export function rsvp({ name, identifier }) {
  return call('rsvp', { p_name: name, p_identifier: identifier });
}

/**
 * Cancel an RSVP using just the NUS email.
 * status: ok | not_found | already_checked_in | invalid_identifier
 */
export function cancelRsvp({ identifier }) {
  return call('cancel_rsvp', { p_identifier: identifier });
}

/**
 * Self check-in on the night (from the QR code).
 * status: ok | already (+name, cup_number, checked_in_at, type)
 *         | need_name | walkins_not_yet (+release_at) | no_cups
 *         | not_open (+opens_at, closes_at) | invalid_identifier
 */
export function checkIn({ identifier, name }) {
  return call('check_in', { p_identifier: identifier, p_name: name || null });
}

/**
 * Organiser check-in from /admin. Same statuses as checkIn plus forbidden.
 * Skips the time window and walk-in release, still respects the cup cap.
 */
export function adminCheckIn({ identifier, name }) {
  return call('admin_check_in', { p_identifier: identifier, p_name: name || null });
}

/**
 * Public counters (no personal data).
 * { rsvp_count, rsvp_cap, cap, checked_in, cups_left, rsvp_open,
 *   release_at, checkin_opens, checkin_closes }
 */
export function publicStats() {
  return call('public_stats');
}

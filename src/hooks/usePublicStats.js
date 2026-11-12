import { useEffect, useState } from 'react';
import { publicStats } from '../lib/api';

// Fetches the public settings/counts once when a page opens.
// stats = null while loading; error is set if the request failed.
export function usePublicStats() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    publicStats()
      .then((s) => !cancelled && setStats(s))
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, error, loading: !stats && !error };
}

export function isFull(stats) {
  return !!stats && stats.rsvp_count >= stats.rsvp_cap;
}

// 'open' | 'before' | 'after'  (based on the check-in window in settings)
export function checkinState(stats, now = new Date()) {
  const opens = stats?.checkin_opens ? new Date(stats.checkin_opens) : null;
  const closes = stats?.checkin_closes ? new Date(stats.checkin_closes) : null;
  if (!opens || now < opens) return 'before';
  if (closes && now > closes) return 'after';
  return 'open';
}

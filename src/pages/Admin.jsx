import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import {
  isAdmin,
  listAttendees,
  publicStats,
  removeAttendee,
  setCheckinOpen,
  setSpots,
  setWalkinsAllowed,
  signIn,
  signOut,
} from '../lib/api';
import { checkinState } from '../hooks/usePublicStats';
import { formatDateTime, formatTime } from '../lib/format';

const REFRESH_MS = 10000;

// /admin: organiser dashboard.
// Login uses Supabase Auth (email + password). Being logged in isn't enough:
// the user must also be in the admins table, which the database checks.
export default function Admin() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  const [admin, setAdmin] = useState(null); // null = checking, true/false
  const [checkError, setCheckError] = useState(null); // the is_admin() call itself failed

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setAdmin(null);
    setCheckError(null);
    if (!session) return;
    isAdmin()
      .then((ok) => setAdmin(!!ok))
      .catch((err) => {
        console.error('is_admin failed:', err);
        setCheckError(err?.message || String(err));
        setAdmin(false);
      });
  }, [session]);

  if (session === undefined || (session && admin === null)) {
    return <main className="page"><p className="muted center">Loading…</p></main>;
  }
  if (!session) return <Login />;
  if (checkError) {
    return (
      <main className="page">
        <section className="card center">
          <h1>Couldn't check organiser access</h1>
          <p className="notice notice--error">{checkError}</p>
          <p className="muted small">
            If this mentions <code>is_admin</code>, re-run <code>supabase/schema.sql</code> in the Supabase SQL Editor.
          </p>
          <button className="btn btn--secondary" type="button" onClick={signOut}>Log out</button>
        </section>
      </main>
    );
  }
  if (!admin) {
    return (
      <main className="page">
        <section className="card center">
          <h1>Not an organiser</h1>
          <p>
            You're logged in as <strong>{session.user.email}</strong>, but this account isn't on the organiser list.
          </p>
          <button className="btn btn--secondary" type="button" onClick={signOut}>Log out</button>
        </section>
      </main>
    );
  }
  return <Dashboard email={session.user.email} />;
}

function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await signIn(form); // onAuthStateChange in <Admin> takes it from here
    } catch (err) {
      console.error('login failed:', err);
      setError(err?.message === 'Invalid login credentials' ? 'Wrong email or password.' : "Couldn't log in. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <Link className="back" to="/">← Back</Link>
      <form className="card form" onSubmit={onSubmit} noValidate>
        <h1>Organiser login</h1>
        <label className="field">
          <span>Email</span>
          <input
            type="email"
            value={form.email}
            onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            autoComplete="username"
            autoCapitalize="none"
          />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
            autoComplete="current-password"
          />
        </label>
        {error && <p className="notice notice--error">{error}</p>}
        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </main>
  );
}

function Dashboard({ email }) {
  const [people, setPeople] = useState(null);
  const [stats, setStats] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all'); // all | waiting | checked
  const [busyId, setBusyId] = useState(null);
  const [notice, setNotice] = useState(null); // { kind, text }

  const refresh = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([listAttendees(), publicStats()]);
      setPeople(list);
      setStats(s);
      setUpdatedAt(new Date());
      setLoadError(null);
    } catch (err) {
      console.error('admin refresh failed:', err);
      setLoadError("Couldn't refresh. Showing the last data loaded.");
    }
  }, []);

  // "Live": refresh every 10s while the tab is visible, and on returning to it.
  useEffect(() => {
    refresh();
    const id = setInterval(() => !document.hidden && refresh(), REFRESH_MS);
    const onVisible = () => !document.hidden && refresh();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const counts = useMemo(() => {
    const list = people || [];
    return {
      rsvps: list.filter((p) => p.type === 'rsvp').length,
      checkedIn: list.filter((p) => p.checked_in_at).length,
    };
  }, [people]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (people || []).filter((p) => {
      if (filter === 'waiting' && p.checked_in_at) return false;
      if (filter === 'checked' && !p.checked_in_at) return false;
      return !q || p.name.toLowerCase().includes(q) || p.identifier.includes(q);
    });
  }, [people, query, filter]);

  async function onRemove(person) {
    if (!window.confirm(`Remove ${person.name} (${person.identifier})? This frees their spot.`)) return;
    setBusyId(person.id);
    setNotice(null);
    try {
      const res = await removeAttendee(person.id);
      if (res.status === 'ok') {
        setNotice({ kind: 'ok', text: `Removed ${res.name}.` });
      } else if (res.status === 'checked_in') {
        setNotice({ kind: 'error', text: `${person.name} has already checked in, so they can't be removed.` });
      } else if (res.status === 'not_found') {
        setNotice({ kind: 'error', text: `${person.name} was already removed.` });
      } else {
        setNotice({ kind: 'error', text: "You don't have permission to remove people." });
      }
    } catch (err) {
      console.error('remove failed:', err);
      setNotice({ kind: 'error', text: "Couldn't reach the server. Try again." });
    } finally {
      setBusyId(null);
      refresh();
    }
  }

  return (
    <main className="page page--wide">
      <header className="admin-head">
        <h1>Organiser dashboard</h1>
        <div className="admin-head__user">
          <span className="muted small">{email}</span>
          <button className="link-btn" type="button" onClick={signOut}>Log out</button>
        </div>
      </header>

      <section className="stats">
        <Stat label="Signed up" value={counts.rsvps} of={stats?.rsvp_cap} />
        <Stat label="Checked in" value={counts.checkedIn} of={stats?.cap} />
      </section>
      <p className="muted small center">
        {loadError ? <span className="field__error">{loadError}</span> : updatedAt ? `Updated ${formatTime(updatedAt)} · refreshes every 10s` : 'Loading…'}
      </p>

      {notice && <p className={`notice notice--${notice.kind === 'ok' ? 'ok' : 'error'}`}>{notice.text}</p>}

      {stats && <Settings stats={stats} onChanged={refresh} setNotice={setNotice} />}

      <section className="card">
        <div className="list-tools">
          <input
            className="search"
            type="search"
            placeholder="Search name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="tabs" role="tablist">
            {[
              ['all', 'All'],
              ['waiting', 'Not checked in'],
              ['checked', 'Checked in'],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={filter === key}
                className={`tab ${filter === key ? 'tab--active' : ''}`}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <p className="muted small">
          Showing {visible.length} of {people?.length ?? 0}
        </p>

        <ul className="people">
          {visible.map((p) => (
            <li key={p.id} className="person">
              <div className="person__main">
                <strong>{p.name}</strong>
                <span className="muted small person__email">{p.identifier}</span>
                <span className="muted small">
                  {p.type === 'walkin' ? 'Walk-in' : `Signed up ${formatDateTime(p.created_at)}`}
                </span>
              </div>
              <div className="person__side">
                {p.checked_in_at ? (
                  <span className="chip chip--ok">
                    #{p.cup_number} · {formatTime(p.checked_in_at)}
                  </span>
                ) : (
                  <>
                    <span className="chip">Not in yet</span>
                    <button
                      type="button"
                      className="remove-btn"
                      disabled={busyId === p.id}
                      onClick={() => onRemove(p)}
                    >
                      {busyId === p.id ? 'Removing…' : 'Remove'}
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
          {people && visible.length === 0 && <li className="muted center person--empty">No one matches.</li>}
        </ul>
      </section>
    </main>
  );
}

function Stat({ label, value, of }) {
  return (
    <div className="stat">
      <span className="stat__value">
        {value}
        {of != null && <span className="stat__of"> / {of}</span>}
      </span>
      <span className="stat__label">{label}</span>
    </div>
  );
}

// Organiser controls: open/close check-in, and the number of spots.
function Settings({ stats, onChanged, setNotice }) {
  const [spots, setSpotsInput] = useState(String(stats.cap));
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(null); // 'checkin' | 'walkins' | 'spots'
  const state = checkinState(stats);
  const walkinsOn = !!stats.release_at && new Date(stats.release_at) <= new Date();

  // Keep the box in sync with the database unless someone is typing in it.
  useEffect(() => {
    if (!editing) setSpotsInput(String(stats.cap));
  }, [stats.cap, editing]);

  async function toggleCheckin() {
    const open = state !== 'open';
    if (!open && !window.confirm('Close check-in? Nobody will be able to check themselves in until you reopen it.')) return;
    setBusy('checkin');
    setNotice(null);
    try {
      const res = await setCheckinOpen(open);
      if (res.status === 'ok') setNotice({ kind: 'ok', text: open ? 'Check-in is open.' : 'Check-in is closed.' });
      else setNotice({ kind: 'error', text: "You don't have permission to change this." });
    } catch (err) {
      console.error('set check-in failed:', err);
      setNotice({ kind: 'error', text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  async function toggleWalkins() {
    const allow = !walkinsOn;
    const question = allow
      ? 'Allow walk-ins now? Anyone with an NUS email can check in without a booking, until spots run out.'
      : 'Stop walk-ins? People without a booking will be turned away again.';
    if (!window.confirm(question)) return;
    setBusy('walkins');
    setNotice(null);
    try {
      const res = await setWalkinsAllowed(allow);
      if (res.status === 'ok') setNotice({ kind: 'ok', text: allow ? 'Walk-ins are allowed.' : 'Walk-ins stopped.' });
      else setNotice({ kind: 'error', text: "You don't have permission to change this." });
    } catch (err) {
      console.error('set walk-ins failed:', err);
      setNotice({ kind: 'error', text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  async function saveSpots(e) {
    e.preventDefault();
    const n = Number(spots);
    if (!Number.isInteger(n) || n < 0) {
      setNotice({ kind: 'error', text: 'Spots must be a whole number.' });
      return;
    }
    setBusy('spots');
    setNotice(null);
    try {
      const res = await setSpots(n);
      if (res.status === 'ok') {
        setNotice({ kind: 'ok', text: `Spots set to ${res.spots}.` });
        setEditing(false);
      } else if (res.status === 'too_low') {
        setNotice({
          kind: 'error',
          text: `${res.minimum} people have already signed up or checked in, so spots can't go below ${res.minimum}.`,
        });
      } else if (res.status === 'invalid') {
        setNotice({ kind: 'error', text: 'Spots must be between 0 and 10,000.' });
      } else {
        setNotice({ kind: 'error', text: "You don't have permission to change this." });
      }
    } catch (err) {
      console.error('set spots failed:', err);
      setNotice({ kind: 'error', text: "Couldn't reach the server. Try again." });
    } finally {
      setBusy(null);
      onChanged();
    }
  }

  const statusText =
    state === 'open'
      ? `Open since ${formatTime(stats.checkin_opens)}`
      : state === 'after'
        ? `Closed at ${formatTime(stats.checkin_closes)}`
        : stats.checkin_opens
          ? `Opens ${formatDateTime(stats.checkin_opens)}`
          : 'Not open yet';

  return (
    <section className="card settings">
      <div className="setting">
        <div>
          <strong>Check-in</strong>
          <span className={`chip ${state === 'open' ? 'chip--ok' : ''}`}>{statusText}</span>
        </div>
        <button
          type="button"
          className={`btn ${state === 'open' ? 'btn--danger' : ''} setting__btn`}
          disabled={busy === 'checkin'}
          onClick={toggleCheckin}
        >
          {busy === 'checkin' ? 'Saving…' : state === 'open' ? 'Close check-in' : 'Open check-in now'}
        </button>
      </div>

      <div className="setting">
        <div>
          <strong>Walk-ins</strong>
          <span className={`chip ${walkinsOn ? 'chip--ok' : ''}`}>
            {walkinsOn ? `Allowed since ${formatTime(stats.release_at)}` : 'Booked people only'}
          </span>
        </div>
        <button
          type="button"
          className={`btn ${walkinsOn ? 'btn--danger' : ''} setting__btn`}
          disabled={busy === 'walkins'}
          onClick={toggleWalkins}
        >
          {busy === 'walkins' ? 'Saving…' : walkinsOn ? 'Stop walk-ins' : 'Allow walk-ins now'}
        </button>
      </div>

      <form className="setting" onSubmit={saveSpots}>
        <div>
          <strong>Spots</strong>
          <span className="muted small">Max sign-ups and max check-ins</span>
        </div>
        <div className="setting__row">
          <input
            className="search setting__input"
            type="number"
            inputMode="numeric"
            min={0}
            value={spots}
            onChange={(e) => {
              setEditing(true);
              setSpotsInput(e.target.value);
            }}
          />
          <button
            type="submit"
            className="btn setting__btn"
            disabled={busy === 'spots' || spots === String(stats.cap)}
          >
            {busy === 'spots' ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </section>
  );
}

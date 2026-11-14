import { useState } from 'react';
import { Link } from 'react-router-dom';
import { checkIn } from '../lib/api';
import { formatDateTime, formatTime } from '../lib/format';
import { EVENT } from '../config';
import TelegramButton from '../components/TelegramButton';

// The page people reach by scanning the QR code at the foyer.
// They type their NUS email; walk-ins (no booking) also give a name.
// All the rules (time window, walk-in release, cap) are enforced by the
// check_in() SQL function. This page only shows a screen per status.

export default function Checkin() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [needName, setNeedName] = useState(false); // walk-in: show the name field
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null); // { field?, text }
  const [result, setResult] = useState(null); // full-screen outcome

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await checkIn({ identifier: email, name: needName ? name : null });
      switch (res.status) {
        case 'ok':
        case 'already':
        case 'walkins_not_yet':
        case 'no_cups':
        case 'not_open':
          setResult(res);
          window.scrollTo(0, 0);
          break;
        case 'need_name':
          if (needName) setError({ field: 'name', text: 'Please enter your name.' });
          setNeedName(true);
          break;
        case 'invalid_identifier':
          setError({ field: 'email', text: 'Please use your NUS email, e.g. e1234567@u.nus.edu.' });
          break;
        default:
          setError({ text: 'Something unexpected happened. Please try again.' });
      }
    } catch (err) {
      console.error('check-in failed:', err);
      setError({ text: "Couldn't reach the server. Check your signal and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  function startOver() {
    setResult(null);
    setNeedName(false);
    setName('');
    setError(null);
  }

  if (result?.status === 'ok' || result?.status === 'already') {
    return <Confirmed result={result} />;
  }
  if (result) {
    return <Outcome result={result} onBack={startOver} />;
  }

  return (
    <main className="page">
      <Link className="back" to="/">← Back</Link>
      <form className="card form" onSubmit={onSubmit} noValidate>
        <h1>Check in</h1>
        <p className="muted">Enter the NUS email you signed up with.</p>

        <label className="field">
          <span>NUS email</span>
          <input
            type="email"
            inputMode="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setNeedName(false); // a different email might have a booking
            }}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e1234567@u.nus.edu"
            required
            aria-invalid={error?.field === 'email'}
          />
          {error?.field === 'email' && <small className="field__error">{error.text}</small>}
        </label>

        {needName && (
          <>
            <p className="notice notice--info">
              We couldn't find a booking for this email, but walk-ins are welcome! Check the email for typos, or
              enter your name to check in as a walk-in.
            </p>
            <label className="field">
              <span>Your name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
                maxLength={80}
                autoFocus
                aria-invalid={error?.field === 'name'}
              />
              {error?.field === 'name' && <small className="field__error">{error.text}</small>}
            </label>
          </>
        )}

        {error && !error.field && <p className="notice notice--error">{error.text}</p>}

        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? 'Checking in…' : needName ? 'Check in as walk-in' : 'Check in'}
        </button>
      </form>
    </main>
  );
}

// Big, bright screen to show staff.
export function Confirmed({ result }) {
  const already = result.status === 'already';
  return (
    <main className="checked">
      <div className="checked__tick" aria-hidden="true">✓</div>
      <p className="checked__label">{already ? 'Already checked in' : "You're checked in!"}</p>
      <h1 className="checked__name">{result.name}</h1>

      <div className="checked__number">
        <span className="checked__number-label">Your number</span>
        <span className="checked__number-value">#{result.cup_number}</span>
      </div>

      <p className="checked__meta">
        {result.type === 'walkin' ? 'Walk-in' : 'Booked'} · checked in at {formatTime(result.checked_in_at)}
      </p>

      <p className="checked__hint">Show this screen to staff to collect your bubble tea and snacks 🧋</p>
    </main>
  );
}

export function Outcome({ result, onBack }) {
  let emoji, title, body;
  let showTelegram = false;

  if (result.status === 'not_open') {
    const closed = result.closes_at && new Date() > new Date(result.closes_at);
    emoji = closed ? '🌙' : '⏰';
    title = closed ? 'Check-in has closed' : "Check-in isn't open yet";
    body = closed
      ? 'Thanks for coming to Study Break Night!'
      : result.opens_at
        ? `Check-in opens ${formatDateTime(result.opens_at)} at the ${EVENT.venue}.`
        : `Check-in opens on the day of the event at the ${EVENT.venue}.`;
  } else if (result.status === 'walkins_not_yet') {
    emoji = '⏳';
    title = 'No booking found for this email';
    const at = formatTime(result.release_at);
    body = `If you signed up, check the email for typos. Otherwise, walk-in spots open ${
      at ? `at ${at}` : 'later in the night'
    }. Come back then!`;
  } else {
    // no_cups
    emoji = '😢';
    title = "Sorry, we're all out";
    body = "Every spot has been claimed tonight. Thanks for coming by, and good luck for finals!";
    showTelegram = true;
  }

  return (
    <main className="page">
      <section className="card center">
        <div className="hero__emoji" aria-hidden="true">{emoji}</div>
        <h1>{title}</h1>
        <p>{body}</p>
        {showTelegram && <TelegramButton />}
        <button className="btn btn--secondary" type="button" onClick={onBack}>
          Try a different email
        </button>
        <Link className="link-btn" to="/">Back to home</Link>
      </section>
    </main>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { rsvp } from '../lib/api';
import { usePublicStats, isFull } from '../hooks/usePublicStats';
import { formatTime } from '../lib/format';
import { EVENT } from '../config';
import EventFacts from '../components/EventFacts';
import TelegramButton from '../components/TelegramButton';

export default function Signup() {
  const navigate = useNavigate();
  const { stats } = usePublicStats();
  const [form, setForm] = useState({ name: '', identifier: '' });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null); // { field?, text }
  const [confirmed, setConfirmed] = useState(null); // { name, identifier }
  const [alreadySignedUp, setAlreadySignedUp] = useState(null); // the email they typed

  const releaseLabel = formatTime(stats?.release_at) || EVENT.defaultReleaseLabel;

  // Someone opened /signup directly (or stats loaded after clicking) and it's full/closed.
  useEffect(() => {
    if (!stats || confirmed || alreadySignedUp) return;
    if (!stats.rsvp_open) navigate('/full?reason=closed', { replace: true });
    else if (isFull(stats)) navigate('/full', { replace: true });
  }, [stats, confirmed, alreadySignedUp, navigate]);

  function update(field) {
    return (e) => setForm((f) => ({ ...f, [field]: e.target.value }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await rsvp(form);
      switch (res.status) {
        case 'ok':
          setConfirmed({ name: res.name, identifier: form.identifier.trim() });
          window.scrollTo(0, 0);
          break;
        case 'full':
          navigate('/full', { replace: true });
          break;
        case 'closed':
          navigate('/full?reason=closed', { replace: true });
          break;
        case 'already_registered':
          setAlreadySignedUp(form.identifier.trim());
          window.scrollTo(0, 0);
          break;
        case 'invalid_name':
          setMessage({ field: 'name', text: 'Please enter your name (up to 80 characters).' });
          break;
        case 'invalid_identifier':
          setMessage({
            field: 'identifier',
            text: 'Please use your NUS email, e.g. e1234567@u.nus.edu.',
          });
          break;
        default:
          setMessage({ text: 'Something unexpected happened. Please try again.' });
      }
    } catch (err) {
      console.error('rsvp failed:', err); // shows the real cause in the browser console
      setMessage({ text: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setSubmitting(false);
    }
  }

  if (confirmed) {
    return (
      <main className="page">
        <section className="card confirm">
          <div className="confirm__tick" aria-hidden="true">✓</div>
          <h1>You're in, {confirmed.name}!</h1>
          <EventFacts />
          <p className="confirm__held">
            Your spot is held until <strong>{releaseLabel}</strong>.
          </p>

          <OnTheNight email={confirmed.identifier} />
        </section>
      </main>
    );
  }

  // Same email signed up before. We deliberately don't show the name it was
  // registered under, so typing someone else's email reveals nothing.
  if (alreadySignedUp) {
    return (
      <main className="page">
        <section className="card confirm">
          <div className="confirm__tick" aria-hidden="true">✓</div>
          <h1>You've already signed up!</h1>
          <p>
            <strong>{alreadySignedUp}</strong> already has a spot reserved, so there's no need to sign up again.
          </p>
          <EventFacts />
          <p className="confirm__held">
            Your spot is held until <strong>{releaseLabel}</strong>.
          </p>

          <OnTheNight email={alreadySignedUp} />

          <button
            className="link-btn"
            type="button"
            onClick={() => {
              setAlreadySignedUp(null);
              setForm({ name: '', identifier: '' });
            }}
          >
            Sign up a different email
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <Link className="back" to="/">← Back</Link>
      <form className="card form" onSubmit={onSubmit} noValidate>
        <h1>Reserve your spot</h1>
        <p className="muted">One per person. Your spot is held until {releaseLabel} on the night.</p>

        <label className="field">
          <span>Name</span>
          <input
            value={form.name}
            onChange={update('name')}
            autoComplete="name"
            maxLength={80}
            required
            aria-invalid={message?.field === 'name'}
          />
          {message?.field === 'name' && <small className="field__error">{message.text}</small>}
        </label>

        <label className="field">
          <span>NUS email</span>
          <input
            type="email"
            inputMode="email"
            value={form.identifier}
            onChange={update('identifier')}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e1234567@u.nus.edu"
            required
            aria-invalid={message?.field === 'identifier'}
          />
          {message?.field === 'identifier' && <small className="field__error">{message.text}</small>}
        </label>

        {message && !message.field && <p className="notice notice--error">{message.text}</p>}

        <button className="btn" type="submit" disabled={submitting}>
          {submitting ? 'Reserving your spot…' : 'Reserve my spot'}
        </button>

        <p className="fineprint">
          We only keep your name and NUS email to manage sign-ups, and delete them after the event.
        </p>
      </form>
    </main>
  );
}

// Shared by the "You're in" and "Already signed up" screens.
function OnTheNight({ email }) {
  return (
    <>
      <h2>On the night</h2>
      <ol className="steps">
        <li>Come to the {EVENT.venue}.</li>
        <li>
          Scan the QR code (or tap <em>Check in</em> on this site) and enter <strong>{email}</strong>.
        </li>
        <li>Show the confirmation screen to staff to collect your bubble tea and snacks.</li>
      </ol>

      <TelegramButton>Join the Telegram channel for updates</TelegramButton>
      <p className="muted small">
        Can't make it? <Link to="/cancel">Cancel your booking</Link> so someone else can have your spot.
      </p>
    </>
  );
}

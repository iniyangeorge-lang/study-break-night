import { useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelRsvp } from '../lib/api';

export default function Cancel() {
  const [identifier, setIdentifier] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await cancelRsvp({ identifier });
      switch (res.status) {
        case 'ok':
          setDone(true);
          break;
        case 'not_found':
          setError("We couldn't find a booking for that email. Check for typos.");
          break;
        case 'already_checked_in':
          setError("You've already checked in, so this booking can't be cancelled.");
          break;
        case 'invalid_identifier':
          setError('Please use your NUS email, e.g. e1234567@u.nus.edu.');
          break;
        default:
          setError('Something unexpected happened. Please try again.');
      }
    } catch (err) {
      console.error('cancel failed:', err);
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <main className="page">
        <section className="card center">
          <div className="confirm__tick" aria-hidden="true">✓</div>
          <h1>Booking cancelled</h1>
          <p>Thanks for letting us know. Your spot will go to someone else.</p>
          <Link className="btn btn--secondary" to="/">Back to home</Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page">
      <Link className="back" to="/">← Back</Link>
      <form className="card form" onSubmit={onSubmit} noValidate>
        <h1>Cancel your booking</h1>
        <p className="muted">Enter the NUS email you signed up with.</p>

        <label className="field">
          <span>NUS email</span>
          <input
            type="email"
            inputMode="email"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="e1234567@u.nus.edu"
            required
            aria-invalid={!!error}
          />
        </label>

        {error && <p className="notice notice--error">{error}</p>}

        <button className="btn btn--danger" type="submit" disabled={submitting}>
          {submitting ? 'Cancelling…' : 'Cancel my booking'}
        </button>
      </form>
    </main>
  );
}

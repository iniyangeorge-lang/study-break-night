import { Link, useNavigate } from 'react-router-dom';
import { EVENT, MENU } from '../config';
import EventFacts from '../components/EventFacts';
import { usePublicStats, isFull, checkinState } from '../hooks/usePublicStats';
import { formatDateTime } from '../lib/format';

export default function Home() {
  const navigate = useNavigate();
  const { stats } = usePublicStats();
  const checkin = checkinState(stats);
  // Grey out Check in until an organiser opens it. Only once stats have
  // loaded: if they fail to load, keep the button usable (check_in() in
  // the database still enforces the window).
  const checkinDisabled = !!stats && checkin !== 'open';

  // If we already know sign-ups are full/closed, skip straight to that page.
  // (The sign-up page double-checks, in case stats hadn't loaded yet.)
  function onSignUp() {
    if (stats && !stats.rsvp_open) navigate('/full?reason=closed');
    else if (isFull(stats)) navigate('/full');
    else navigate('/signup');
  }

  return (
    <main className="page">
      <header className="hero">
        <div className="hero__emoji" aria-hidden="true">🧋</div>
        <h1>{EVENT.title}</h1>
        <p className="hero__tagline">{EVENT.tagline}</p>
        <EventFacts />
      </header>

      <section className="card menu" aria-labelledby="menu-title">
        <h2 id="menu-title">On the menu</h2>
        {MENU.map((section) => (
          <div className="menu__section" key={section.heading}>
            <h3>{section.heading}</h3>
            <ul className="menu__list">
              {section.items.map((item) => (
                <li key={item.name}>
                  {item.emoji && <span className="menu__emoji" aria-hidden="true">{item.emoji}</span>}
                  <span>
                    {item.name}
                    {item.note && <span className="muted"> · {item.note}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      <section className="actions">
        <button className="btn" type="button" onClick={onSignUp}>
          Reserve your spot
        </button>

        {checkinDisabled ? (
          <button className="btn btn--secondary" type="button" disabled>
            Check in
          </button>
        ) : (
          <Link className="btn btn--secondary" to="/checkin">
            Check in
          </Link>
        )}
        {checkinDisabled && (
          <p className="actions__hint">
            {checkin === 'after'
              ? 'Check-in has closed'
              : stats?.checkin_opens
                ? `Opens ${formatDateTime(stats.checkin_opens)}`
                : 'Opens on the day of the event'}
          </p>
        )}

        <Link className="link-btn" to="/cancel">
          Can't make it? Cancel your booking
        </Link>
      </section>
    </main>
  );
}

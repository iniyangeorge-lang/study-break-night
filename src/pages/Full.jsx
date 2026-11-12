import { Link, useSearchParams } from 'react-router-dom';
import TelegramButton from '../components/TelegramButton';

// Shown when sign-ups are full (/full) or switched off by organisers (/full?reason=closed).
export default function Full() {
  const [params] = useSearchParams();
  const closed = params.get('reason') === 'closed';

  return (
    <main className="page">
      <section className="card center">
        <div className="hero__emoji" aria-hidden="true">😢</div>
        <h1>{closed ? 'Sign-ups are closed' : 'Sorry, all spots are filled'}</h1>
        <p>
          Join our Telegram channel. If any spots open up, we'll let you know there.
        </p>
        <TelegramButton />
        <Link className="link-btn" to="/">Back to home</Link>
      </section>
    </main>
  );
}

import { TELEGRAM_URL } from '../config';

// Hidden if VITE_TELEGRAM_CHANNEL_URL isn't set.
export default function TelegramButton({ children = 'Join our Telegram channel' }) {
  if (!TELEGRAM_URL) return null;
  return (
    <a className="btn btn--secondary" href={TELEGRAM_URL} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

import { EVENT } from '../config';

// Date / time / venue line, reused on several pages.
export default function EventFacts() {
  return (
    <ul className="facts">
      <li>📅 {EVENT.date}</li>
      <li>🕖 {EVENT.time}</li>
      <li>📍 {EVENT.venue}</li>
    </ul>
  );
}

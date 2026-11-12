// Always show times in Singapore time, whatever the phone's timezone is.
const timeFmt = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const dateTimeFmt = new Intl.DateTimeFormat('en-SG', {
  timeZone: 'Asia/Singapore',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function formatTime(iso) {
  if (!iso) return null;
  return timeFmt.format(new Date(iso)).replace(' ', '').toLowerCase(); // "7:45pm"
}

export function formatDateTime(iso) {
  if (!iso) return null;
  return dateTimeFmt.format(new Date(iso));
}

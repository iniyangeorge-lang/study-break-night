// ============================================================
// Everything shown on the home page lives here, so you can change
// it without touching any page code. Save, and the dev server
// updates instantly. (Caps, release time and the check-in window
// live in the database settings row instead.)
// ============================================================

export const EVENT = {
  title: 'Study Break Night',
  tagline: 'Free bubble tea + snacks to fuel your finals',
  date: 'Date TBC', // TODO: confirm with organisers
  time: '7–9pm',
  venue: 'COM1 foyer',
  defaultReleaseLabel: '7:45pm', // shown if release_at isn't set in settings yet
};

// The menu. Add, remove or reorder items freely.
// `emoji` and `note` are optional.
// TODO: replace with the confirmed order from organisers.
export const MENU = [
  {
    heading: 'Drinks',
    items: [
      { emoji: '🧋', name: 'Brown sugar milk tea', note: 'with pearls' },
      { emoji: '🍵', name: 'Jasmine green milk tea' },
      { emoji: '🍑', name: 'Peach oolong tea', note: 'non-dairy' },
    ],
  },
  {
    heading: 'Snacks',
    items: [
      { emoji: '🍪', name: 'Cookies' },
      { emoji: '🥟', name: 'Curry puffs' },
      { emoji: '🍫', name: 'Chocolate bars' },
    ],
  },
];

export const TELEGRAM_URL = import.meta.env.VITE_TELEGRAM_CHANNEL_URL || '';

import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// If .env is missing we show a clear message instead of a blank page.
export const configError =
  !url || !key ? 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill it in, then restart npm run dev.' : null;

export const supabase = configError ? null : createClient(url, key);

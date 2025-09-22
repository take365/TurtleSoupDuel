import { headers } from 'next/headers';
import SelectionScreen from './SelectionScreen';

async function fetchThemes() {
  const hdrs = headers();
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') || 'http';
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
  const cookie = hdrs.get('cookie') || '';
  const init: RequestInit = { cache: 'no-store' };
  if (cookie) {
    init.headers = { cookie };
  }
  const r = await fetch(`${base}/api/themes`, init);
  return r.json();
}

export default async function ThemesPage() {
  const themes = await fetchThemes();
  return <SelectionScreen themes={themes} />;
}

import { headers } from 'next/headers';
import SelectionScreen from './SelectionScreen';

async function fetchThemes() {
  const hdrs = headers();
  const cookie = hdrs.get('cookie') || '';
  const init: RequestInit = { cache: 'no-store' };
  if (cookie) {
    init.headers = { cookie };
  }

  // .env.local の設定を優先
  const base = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000/api/v1';

  const r = await fetch(`${base}/themes`, init);
  const raw = await r.json();

  const mapped = Array.isArray(raw)
    ? raw.map((x: any) => ({
        themeId: x.id,
        title: x.title,
        snippet: x.snippet ?? x.question ?? '',
        likes: x.likes ?? 0,
        liked: x.liked ?? false,
        cleared: x.cleared ?? false,
      }))
    : [];

  return mapped;
}

export default async function ThemesPage() {
  const themes = await fetchThemes();
  return <SelectionScreen themes={themes} />;
}

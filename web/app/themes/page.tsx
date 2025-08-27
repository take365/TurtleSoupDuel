import { headers } from 'next/headers';

async function fetchThemes() {
  const hdrs = headers();
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') || 'http';
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
  const r = await fetch(`${base}/api/themes`, { cache: 'no-store' });
  return r.json();
}

export default async function ThemesPage() {
  const themes = await fetchThemes();
  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-bold mb-4">テーマ一覧</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {themes.map((t: any) => (
          <a key={t.themeId} href={`/play/${t.themeId}`} className="block border rounded p-4 hover:shadow">
            <h2 className="font-semibold">{t.title}</h2>
            <p className="text-sm text-gray-600">{t.snippet}</p>
            <div className="text-xs text-gray-500 mt-2">likes: {t.likes} / cleared: {String(t.cleared)}</div>
          </a>
        ))}
      </div>
    </main>
  );
}

import { headers } from 'next/headers';

async function fetchMine() {
  const hdrs = headers();
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') || 'http';
  const cookie = hdrs.get('cookie') || '';
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
  const r = await fetch(`${base}/api/user-themes`, { cache: 'no-store', headers: { cookie } });
  try { return { ok: r.ok, data: await r.json() }; } catch { return { ok: r.ok, data: [] }; }
}

export default async function MyThemesPage() {
  const res = await fetchMine();
  if (!res.ok) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-bold">/my/themes</h1>
          <p className="text-red-600">未ログイン/凍結などで取得できません。</p>
          <div className="space-x-4">
            <a className="underline text-blue-600" href="/login">ログイン</a>
            <a className="underline text-blue-600" href="/submit/theme">テーマ投稿</a>
          </div>
        </div>
      </main>
    );
  }
  const items = res.data || [];
  return (
    <main className="min-h-screen p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">自分の投稿</h1>
      <div className="space-y-3">
        {items.map((t: any) => (
          <div key={t.id} className="border rounded p-4">
            <div className="text-sm text-gray-500">{t.id}</div>
            <div className="font-semibold">{t.payload?.title || '(no title)'}</div>
            <div className="text-sm">status: {t.status}</div>
            <div className="mt-2 text-sm">
              <a className="underline text-blue-600" href={`/submit/theme?id=${encodeURIComponent(t.id)}`}>編集</a>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <a href="/submit/theme" className="underline text-blue-600">新規投稿</a>
      </div>
    </main>
  );
}

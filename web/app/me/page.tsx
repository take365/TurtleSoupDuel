import { headers } from 'next/headers';

async function fetchMe() {
  const hdrs = headers();
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') || 'http';
  const cookie = hdrs.get('cookie') || '';
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
  const r = await fetch(`${base}/api/auth/me`, { cache: 'no-store', headers: { cookie } });
  try { return { ok: r.ok, data: await r.json() }; } catch { return { ok: r.ok, data: null }; }
}

export default async function MePage() {
  const res = await fetchMe();
  if (!res.ok) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-bold">/me</h1>
          <p className="text-red-600">未ログインまたはセッション切れです。</p>
          <div className="space-x-4">
            <a className="underline text-blue-600" href="/login">ログイン</a>
            <a className="underline text-blue-600" href="/signup">サインアップ</a>
          </div>
        </div>
      </main>
    );
  }

  async function logout() {
    'use server';
    await fetch('/api/auth/logout', { method: 'POST' });
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-4">
        <h1 className="text-xl font-bold">ログイン情報</h1>
        <pre className="bg-gray-50 border rounded p-4 text-sm overflow-auto">{JSON.stringify(res.data, null, 2)}</pre>
        <form action={logout}>
          <button className="bg-gray-800 text-white rounded px-3 py-2">ログアウト</button>
        </form>
        <div className="space-x-4">
          <a className="underline text-blue-600" href="/">ホーム</a>
        </div>
      </div>
    </main>
  );
}

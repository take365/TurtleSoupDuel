import { headers } from 'next/headers';

async function fetchMe() {
  const hdrs = headers();
  const host = hdrs.get('x-forwarded-host') || hdrs.get('host');
  const proto = hdrs.get('x-forwarded-proto') || 'http';
  const cookie = hdrs.get('cookie') || '';
  const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
  try {
    const r = await fetch(`${base}/api/auth/me`, { cache: 'no-store', headers: { cookie } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

export default async function HomePage() {
  const me = await fetchMe();
  if (!me) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">TurtleSoupDuel Frontend</h1>
          <p className="text-gray-600">まずはログインまたはサインアップしてください。</p>
          <div className="space-x-4">
            <a className="underline text-blue-600" href="/login">/login</a>
            <a className="underline text-blue-600" href="/signup">/signup</a>
          </div>
          <p className="text-sm text-gray-500">Health: <a className="underline" href="/api/health">/api/health</a></p>
        </div>
      </main>
    );
  }
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">ようこそ、{me.handle}</h1>
        <div className="space-x-4">
          <a className="underline text-blue-600" href="/themes">/themes</a>
          <a className="underline text-blue-600" href="/submit/theme">/submit/theme</a>
          <a className="underline text-blue-600" href="/my/themes">/my/themes</a>
          <a className="underline text-blue-600" href="/me">/me</a>
        </div>
      </div>
    </main>
  );
}

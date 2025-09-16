import './globals.css';
import type { Metadata } from 'next';
import { headers, cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export const metadata: Metadata = {
  title: 'TurtleSoupDuel',
  description: 'Next.js frontend for TurtleSoupDuel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  async function NavBar() {
    const hdrs = headers();
    const host = hdrs.get('x-forwarded-host') || hdrs.get('host');
    const proto = hdrs.get('x-forwarded-proto') || 'http';
    const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
    let me: any = null;
    try {
      const r = await fetch(`${base}/api/auth/me`, { cache: 'no-store', headers: { cookie: hdrs.get('cookie') || '' } });
      if (r.ok) me = await r.json();
    } catch {}

    async function logout() {
      'use server';
      await fetch('/api/auth/logout', { method: 'POST' });
      redirect('/');
    }

    return (
      <div className="w-full border-b bg-white">
        <div className="max-w-5xl mx-auto px-4 h-12 flex items-center gap-4">
          <a href="/" className="font-semibold">TurtleSoupDuel</a>
          <a href="/themes" className="text-sm text-gray-700 hover:underline">Themes</a>
          {me && (
            <>
              <a href="/submit/theme" className="text-sm text-gray-700 hover:underline">Submit</a>
              <a href="/my/themes" className="text-sm text-gray-700 hover:underline">My Themes</a>
            </>
          )}
          {!!me?.role && me.role.toLowerCase() === 'admin' && (
            <>
              <a href="/admin/invites" className="text-sm text-gray-700 hover:underline">Admin Invites</a>
              <a href="/admin/users" className="text-sm text-gray-700 hover:underline">Admin Users</a>
            </>
          )}
          <div className="ml-auto flex items-center gap-3">
            {!me && (
              <>
                <a href="/login" className="text-sm text-blue-700 hover:underline">Login</a>
                <a href="/signup" className="text-sm text-blue-700 hover:underline">Signup</a>
              </>
            )}
            {me && (
              <>
                <a href="/me" className="text-sm text-gray-700 hover:underline">Me</a>
                {/* @ts-expect-error Server Action */}
                <form action={logout}><button className="text-sm text-gray-700 underline" type="submit">Logout</button></form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }
  async function UsageBar() {
    const hdrs = headers();
    const host = hdrs.get('x-forwarded-host') || hdrs.get('host');
    const proto = hdrs.get('x-forwarded-proto') || 'http';
    const base = host ? `${proto}://${host}` : (process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
    let data: any = null;
    try {
      const r = await fetch(`${base}/api/me/usage`, { cache: 'no-store', headers: { cookie: hdrs.get('cookie') || '' } });
      if (r.ok) data = await r.json();
    } catch {}
    const limit = Number(process.env.NEXT_PUBLIC_DAILY_CALL_LIMIT || 100);
    const used = Number(data?.today?.calls || 0);
    const ratio = Math.max(0, Math.min(1, used / Math.max(1, limit)));
    if (!data) return null;
    return (
      <div className="w-full bg-gray-100 border-b">
        <div className="max-w-5xl mx-auto px-4 py-2 text-sm flex items-center gap-3">
          <div className="w-48 h-2 bg-white rounded border">
            <div className="h-2 bg-green-600 rounded" style={{ width: `${ratio * 100}%` }} />
          </div>
          <div className="text-gray-700">今日の使用: {used} / {limit}</div>
          <div className="ml-auto text-xs text-gray-500"><a className="underline" href="/me">詳細</a></div>
        </div>
      </div>
    );
  }
  return (
    <html lang="ja">
      <body>
        {/* @ts-expect-error Async Server Component */}
        <NavBar />
        {/* 認証済みなら使用量メーターを表示（未認証なら非表示） */}
        {/* @ts-expect-error Async Server Component */}
        <UsageBar />
        {children}
      </body>
    </html>
  );
}

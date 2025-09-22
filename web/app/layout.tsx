import './globals.css';
import type { Metadata } from 'next';
import { headers } from 'next/headers';
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

    let usageData: any = null;
    const limit = Number(process.env.NEXT_PUBLIC_DAILY_CALL_LIMIT || 100);
    let used = 0;
    try {
      const r = await fetch(`${base}/api/me/usage`, { cache: 'no-store', headers: { cookie: hdrs.get('cookie') || '' } });
      if (r.ok) usageData = await r.json();
    } catch {}
    if (usageData && typeof usageData.today?.calls === 'number') {
      used = Number(usageData.today.calls);
    }
    const showUsage = !!usageData;

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
          <div className="ml-auto flex items-center gap-4">
            {showUsage && (
              <div className="flex items-center gap-2 text-sm text-gray-700">
                <span>今日の使用: {used} / {limit}</span>
                <a className="text-xs text-gray-500 underline" href="/me">詳細</a>
              </div>
            )}
            <div className="flex items-center gap-3">
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
      </div>
    );
  }
  return (
    <html lang="ja">
      <body>
        {/* @ts-expect-error Async Server Component */}
        <NavBar />
        {children}
      </body>
    </html>
  );
}

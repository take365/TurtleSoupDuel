import { NextResponse } from 'next/server';
import { getCassandra } from '@/lib/cassandra';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  let cassandra; try { cassandra = await getCassandra(); await cassandra.connect(); } catch {}
  const sid = req.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith('sid='))?.slice(4);
  if (sid) {
    try {
      await cassandra.execute('DELETE FROM sessions_by_id WHERE session_id=?', [sid], { prepare: true });
    } catch {}
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set('sid', '', { httpOnly: true, path: '/', maxAge: 0, sameSite: 'lax' });
  return res;
}

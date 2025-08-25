import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCassandra } from '@/lib/cassandra';

export const runtime = 'nodejs';

function jsonError(code: string, message: string, hint?: string, status = 400) {
  return NextResponse.json({ code, message, hint }, { status });
}

export async function GET() {
  const sid = cookies().get('sid')?.value;
  if (!sid) return jsonError('unauthorized', 'No session', undefined, 401);

  let cassandra;
  try { cassandra = await getCassandra(); await cassandra.connect(); }
  catch (e: any) { return jsonError('db_unavailable', 'Database connection failed', e?.message, 500); }

  try {
    const r1 = await cassandra.execute(
      'SELECT user_id, expires_at FROM sessions_by_id WHERE session_id=?',
      [sid], { prepare: true }
    );
    if (r1.rowLength === 0) return jsonError('unauthorized', 'Session not found', undefined, 401);
    const userId: string = r1.first()!.get('user_id');
    const expiresAt: Date | null = r1.first()!.get('expires_at');
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      // Expired: best-effort cleanup
      try { await cassandra.execute('DELETE FROM sessions_by_id WHERE session_id=?', [sid], { prepare: true }); } catch {}
      return jsonError('unauthorized', 'Session expired', undefined, 401);
    }

    const r2 = await cassandra.execute(
      'SELECT handle, role FROM users_by_id WHERE user_id=?',
      [userId], { prepare: true }
    );
    if (r2.rowLength === 0) return jsonError('unauthorized', 'User not found', undefined, 401);
    const handle: string = r2.first()!.get('handle');
    const role: string = r2.first()!.get('role');
    return NextResponse.json({ userId, handle, role, frozen: false });
  } catch (e: any) {
    return jsonError('server_error', 'Unexpected error', e?.message, 500);
  }
}


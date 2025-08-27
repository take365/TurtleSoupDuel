import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCassandra } from '@/lib/cassandra';
import { getSessionUser } from '@/lib/auth';

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
    const s = await getSessionUser(cassandra);
    if (!s) return jsonError('unauthorized', 'Session not found', undefined, 401);
    return NextResponse.json(s);
  } catch (e: any) {
    return jsonError('server_error', 'Unexpected error', e?.message, 500);
  }
}

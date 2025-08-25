import { NextResponse } from 'next/server';
import { getCassandra } from '@/lib/cassandra';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { verifyPassword } from '@/lib/password';

export const runtime = 'nodejs';

const LoginSchema = z.object({
  handle: z.string().regex(/^[a-zA-Z0-9_]{3,32}$/),
  password: z.string().min(8).max(128),
});

function jsonError(code: string, message: string, hint?: string, status = 400) {
  return NextResponse.json({ code, message, hint }, { status });
}

export async function POST(req: Request) {
  let cassandra;
  try { cassandra = await getCassandra(); await cassandra.connect(); }
  catch (e: any) { return jsonError('db_unavailable', 'Database connection failed', e?.message); }

  let body: unknown;
  try { body = await req.json(); } catch { return jsonError('invalid_json', 'Request body must be JSON'); }
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation_error', 'Invalid input', parsed.error.issues.map(i => i.message).join(', '));
  }
  const { handle, password } = parsed.data;

  try {
    const r1 = await cassandra.execute(
      'SELECT user_id FROM handle_to_user WHERE handle=?',
      [handle], { prepare: true }
    );
    if (r1.rowLength === 0) return jsonError('invalid_credentials', 'Invalid handle or password', undefined, 401);
    const userId: string = r1.first()!.get('user_id');
    const r2 = await cassandra.execute(
      'SELECT pw_hash, role FROM users_by_id WHERE user_id=?',
      [userId], { prepare: true }
    );
    if (r2.rowLength === 0) return jsonError('invalid_credentials', 'Invalid handle or password', undefined, 401);
    const pwHash: string = r2.first()!.get('pw_hash');
    const ok = await verifyPassword(pwHash, password);
    if (!ok) return jsonError('invalid_credentials', 'Invalid handle or password', undefined, 401);

    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const userAgent = req.headers.get('user-agent') || '';
    await cassandra.execute(
      'INSERT INTO sessions_by_id (session_id, user_id, user_agent, expires_at) VALUES (?, ?, ?, ?) USING TTL 1209600',
      [sessionId, userId, userAgent, expiresAt], { prepare: true }
    );

    const res = NextResponse.json({ sessionId });
    res.cookies.set('sid', sessionId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 14 * 24 * 60 * 60,
    });
    return res;
  } catch (e: any) {
    return jsonError('server_error', 'Unexpected error', e?.message);
  }
}

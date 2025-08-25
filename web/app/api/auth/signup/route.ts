import { NextResponse } from 'next/server';
import { getCassandra } from '@/lib/cassandra';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { hashPassword } from '@/lib/password';

export const runtime = 'nodejs';

const SignupSchema = z.object({
  code: z.string().min(4).max(128),
  handle: z.string().regex(/^[a-zA-Z0-9_]{3,32}$/),
  password: z.string().min(8).max(128),
});

function jsonError(code: string, message: string, hint?: string, status = 400) {
  return NextResponse.json({ code, message, hint }, { status });
}

export async function POST(req: Request) {
  let cassandra;
  try {
    cassandra = await getCassandra();
    await cassandra.connect();
  } catch (e: any) {
    return jsonError('db_unavailable', 'Database connection failed', e?.message);
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('invalid_json', 'Request body must be JSON');
  }
  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError('validation_error', 'Invalid input', parsed.error.issues.map(i => i.message).join(', '));
  }

  const { code, handle, password } = parsed.data;

  // Check invite validity
  try {
    const inviteRes = await cassandra.execute(
      'SELECT max_uses, expires_at FROM invites_by_code WHERE code=?',
      [code], { prepare: true }
    );
    if (inviteRes.rowLength === 0) {
      return jsonError('invite_invalid', 'Invite code is invalid or not found');
    }
    const row = inviteRes.first();
    const maxUses: number = row!.get('max_uses');
    const expiresAt: Date | null = row!.get('expires_at');
    if (expiresAt && expiresAt.getTime() < Date.now()) {
      return jsonError('invite_expired', 'Invite code has expired');
    }
    const userId = uuidv4();
    // Reserve handle (unique) first via LWT
    const r2 = await cassandra.execute(
      'INSERT INTO handle_to_user (handle, user_id) VALUES (?, ?) IF NOT EXISTS',
      [handle, userId], { prepare: true }
    );
    if (!r2.wasApplied()) {
      return jsonError('handle_taken', 'Handle is already in use');
    }

    // Try to claim a slot via LWT. If fails, rollback handle reservation.
    const attempts = Math.max(1, Math.min(16, Math.max(1, maxUses)));
    let claimed = false;
    for (let i = 0; i < attempts; i++) {
      const slot = Math.floor(Math.random() * maxUses);
      const r = await cassandra.execute(
        'UPDATE invite_slots SET claimed_by=?, claimed_at=? WHERE code=? AND slot=? IF claimed_by = null',
        [userId, new Date(), code, slot], { prepare: true }
      );
      if (r.wasApplied()) { claimed = true; break; }
    }
    if (!claimed) {
      // rollback handle reservation
      await cassandra.execute('DELETE FROM handle_to_user WHERE handle=? IF user_id=?', [handle, userId], { prepare: true });
      return jsonError('invite_exhausted', 'Invite usage slots are exhausted');
    }

    // Create user
    const pwHash = await hashPassword(password);
    await cassandra.execute(
      'INSERT INTO users_by_id (user_id, handle, pw_hash, role, created_at) VALUES (?, ?, ?, ?, ?)',
      [userId, handle, pwHash, 'user', new Date()], { prepare: true }
    );

    // Create session with TTL (14 days ≈ 1209600s)
    const sessionId = uuidv4();
    const expiresAt2 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const userAgent = req.headers.get('user-agent') || '';
    await cassandra.execute(
      'INSERT INTO sessions_by_id (session_id, user_id, user_agent, expires_at) VALUES (?, ?, ?, ?) USING TTL 1209600',
      [sessionId, userId, userAgent, expiresAt2], { prepare: true }
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

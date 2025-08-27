import { NextResponse } from 'next/server';
import { getCassandra } from '@/lib/cassandra';
import { ensureActiveUser } from '@/lib/auth';

export const runtime = 'nodejs';

function err(code: string, message: string, hint?: string, status = 400) {
  return NextResponse.json({ code, message, hint }, { status });
}

export async function POST(req: Request, { params }: { params: { characterId: string } }) {
  const { characterId } = params;
  let cassandra;
  try { cassandra = await getCassandra(); await cassandra.connect(); }
  catch (e: any) { return err('db_unavailable', 'Database connection failed', e?.message, 500); }

  let user; try { user = await ensureActiveUser(cassandra); } catch (r: any) { return r; }

  let body: any;
  try { body = await req.json(); } catch { return err('invalid_json', 'Request body must be JSON'); }
  const delta = Number(body?.delta ?? 0);
  if (!Number.isFinite(delta) || Math.abs(delta) > 100) return err('validation_error', 'delta must be a number in [-100,100]');

  try {
    // read current
    let score = 0;
    const r0 = await cassandra.execute('SELECT score FROM affinity_by_user WHERE user_id=? AND character_id=?', [user.userId, characterId], { prepare: true });
    if (r0.rowLength) score = Number(r0.first()!.get('score') || 0);
    const next = Math.max(0, Math.min(100, score + delta));
    await cassandra.execute(
      'INSERT INTO affinity_by_user (user_id, character_id, score, updated_at) VALUES (?, ?, ?, ?)',
      [user.userId, characterId, next, new Date()], { prepare: true }
    );
    return NextResponse.json({ ok: true, score: next });
  } catch (e: any) {
    return err('server_error', 'Unexpected error', e?.message, 500);
  }
}

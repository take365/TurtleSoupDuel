import { NextResponse } from 'next/server';
import { getCassandra } from '@/lib/cassandra';
import { ensureActiveUser } from '@/lib/auth';

export const runtime = 'nodejs';

function err(code: string, message: string, hint?: string, status = 400) {
  return NextResponse.json({ code, message, hint }, { status });
}

export async function POST(_: Request, { params }: { params: { themeId: string } }) {
  const { themeId } = params;
  let cassandra;
  try { cassandra = await getCassandra(); await cassandra.connect(); }
  catch (e: any) { return err('db_unavailable', 'Database connection failed', e?.message, 500); }

  let user; try { user = await ensureActiveUser(cassandra); } catch (r: any) { return r; }

  try {
    const r = await cassandra.execute(
      'INSERT INTO clears_by_user (user_id, theme_id, cleared_at) VALUES (?, ?, ?) IF NOT EXISTS',
      [user.userId, themeId, new Date()], { prepare: true }
    );
    if (!r.wasApplied()) return err('already_cleared', 'Already cleared', undefined, 409);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return err('server_error', 'Unexpected error', e?.message, 500);
  }
}

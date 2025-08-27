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
    const res = await cassandra.execute(
      'DELETE FROM likes_by_user WHERE user_id=? AND theme_id=? IF EXISTS',
      [user.userId, themeId], { prepare: true }
    );
    if (res.wasApplied()) {
      await cassandra.execute(
        'DELETE FROM likes_by_theme WHERE theme_id=? AND user_id=?',
        [themeId, user.userId], { prepare: true }
      );
      await cassandra.execute(
        'UPDATE theme_like_counts SET likes = likes - 1 WHERE theme_id=?',
        [themeId], { prepare: true }
      );
    }
    return NextResponse.json({ ok: true, updated: res.wasApplied() });
  } catch (e: any) {
    return err('server_error', 'Unexpected error', e?.message, 500);
  }
}

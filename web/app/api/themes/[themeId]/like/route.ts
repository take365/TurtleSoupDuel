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
    const applied = (await cassandra.execute(
      'INSERT INTO likes_by_user (user_id, theme_id, liked_at) VALUES (?, ?, ?) IF NOT EXISTS',
      [user.userId, themeId, new Date()], { prepare: true }
    )).wasApplied();
    if (applied) {
      await cassandra.execute(
        'INSERT INTO likes_by_theme (theme_id, user_id, liked_at) VALUES (?, ?, ?)',
        [themeId, user.userId, new Date()], { prepare: true }
      );
      await cassandra.execute(
        'UPDATE theme_like_counts SET likes = likes + 1 WHERE theme_id=?',
        [themeId], { prepare: true }
      );
    }
    return NextResponse.json({ ok: true, updated: applied });
  } catch (e: any) {
    return err('server_error', 'Unexpected error', e?.message, 500);
  }
}

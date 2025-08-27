import { NextResponse } from 'next/server';
import { getCassandra } from '@/lib/cassandra';
import { ensureAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

function err(code: string, message: string, hint?: string, status = 400) {
  return NextResponse.json({ code, message, hint }, { status });
}

export async function POST(_: Request, { params }: { params: { id: string } }) {
  let cassandra; try { cassandra = await getCassandra(); await cassandra.connect(); } catch (e: any) { return err('db_unavailable', 'Database connection failed', e?.message, 500); }
  try { await ensureAdmin(cassandra); } catch (r: any) { return r; }
  const id = params.id;
  try {
    const r = await cassandra.execute('UPDATE user_themes SET status=?, updated_at=? WHERE user_theme_id=? IF status=?', ['public', new Date(), id, 'submitted'], { prepare: true });
    if (!r.wasApplied()) return err('conflict', 'not in submitted state', undefined, 409);
    return NextResponse.json({ ok: true, id, status: 'public' });
  } catch (e: any) { return err('server_error', 'Unexpected error', e?.message, 500); }
}


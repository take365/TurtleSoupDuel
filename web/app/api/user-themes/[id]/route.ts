import { NextResponse } from 'next/server';
import { getCassandra } from '@/lib/cassandra';
import { ensureActiveUser } from '@/lib/auth';

export const runtime = 'nodejs';

function err(code: string, message: string, hint?: string, status = 400) {
  return NextResponse.json({ code, message, hint }, { status });
}

export async function GET(_: Request, { params }: { params: { id: string } }) {
  let cassandra; try { cassandra = await getCassandra(); await cassandra.connect(); } catch (e: any) { return err('db_unavailable', 'Database connection failed', e?.message, 500); }
  let user; try { user = await ensureActiveUser(cassandra); } catch (r: any) { return r; }
  const id = params.id;
  try {
    const r = await cassandra.execute('SELECT author_id, status, payload_json, created_at, updated_at FROM user_themes WHERE user_theme_id=?', [id], { prepare: true });
    if (r.rowLength === 0) return err('not_found', 'theme not found', undefined, 404);
    const authorId = r.first()!.get('author_id');
    if (authorId !== user.userId) return err('forbidden', 'not owner', undefined, 403);
    const status = r.first()!.get('status');
    const payload = (()=>{ try { return JSON.parse(r.first()!.get('payload_json')); } catch { return null; } })();
    const createdAt = r.first()!.get('created_at');
    const updatedAt = r.first()!.get('updated_at');
    return NextResponse.json({ id, status, payload, createdAt, updatedAt });
  } catch (e: any) { return err('server_error', 'Unexpected error', e?.message, 500); }
}


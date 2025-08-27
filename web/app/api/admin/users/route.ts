import { NextResponse } from 'next/server';
import { getCassandra } from '@/lib/cassandra';
import { ensureAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

function err(code: string, message: string, hint?: string, status = 400) { return NextResponse.json({ code, message, hint }, { status }); }

export async function POST(req: Request) {
  let cassandra; try { cassandra = await getCassandra(); await cassandra.connect(); } catch (e: any) { return err('db_unavailable', 'Database connection failed', e?.message, 500); }
  try { await ensureAdmin(cassandra); } catch (r: any) { return r; }
  let body: any; try { body = await req.json(); } catch { return err('invalid_json', 'Request body must be JSON'); }
  const handle = String(body?.handle || '').trim();
  const action = String(body?.action || '').trim().toLowerCase();
  if (!handle || !['freeze','unfreeze'].includes(action)) return err('validation_error', 'handle and action(freeze|unfreeze) are required');
  try {
    const r = await cassandra.execute('SELECT user_id FROM handle_to_user WHERE handle=?', [handle], { prepare: true });
    if (r.rowLength === 0) return err('not_found', 'user not found', undefined, 404);
    const userId: string = r.first()!.get('user_id');
    await cassandra.execute('INSERT INTO user_flags_by_id (user_id, frozen) VALUES (?, ?) ', [userId, action === 'freeze'], { prepare: true });
    return NextResponse.json({ ok: true, handle, action });
  } catch (e: any) { return err('server_error', 'Unexpected error', e?.message, 500); }
}


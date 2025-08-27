import { NextResponse } from 'next/server';
import { getCassandra } from '@/lib/cassandra';
import { ensureActiveUser } from '@/lib/auth';
import { v4 as uuidv4 } from 'uuid';

export const runtime = 'nodejs';

function err(code: string, message: string, hint?: string, status = 400) {
  return NextResponse.json({ code, message, hint }, { status });
}

export async function GET() {
  let cassandra; try { cassandra = await getCassandra(); await cassandra.connect(); } catch (e: any) { return err('db_unavailable', 'Database connection failed', e?.message, 500); }
  let user; try { user = await ensureActiveUser(cassandra); } catch (r: any) { return r; }
  try {
    const r = await cassandra.execute('SELECT user_theme_id, status, payload_json, created_at, updated_at FROM user_themes WHERE author_id=? ALLOW FILTERING', [user.userId], { prepare: true });
    const items = (r.rows || []).map((row: any) => ({ id: row.user_theme_id || row.get('user_theme_id'), status: row.status || row.get('status'), payload: safeJSON(row.payload_json || row.get('payload_json')), createdAt: row.created_at || row.get('created_at'), updatedAt: row.updated_at || row.get('updated_at') }));
    return NextResponse.json(items);
  } catch (e: any) { return err('server_error', 'Unexpected error', e?.message, 500); }
}

function safeJSON(t: any) { try { return JSON.parse(t); } catch { return null; } }

export async function POST(req: Request) {
  let cassandra; try { cassandra = await getCassandra(); await cassandra.connect(); } catch (e: any) { return err('db_unavailable', 'Database connection failed', e?.message, 500); }
  let user; try { user = await ensureActiveUser(cassandra); } catch (r: any) { return r; }
  let body: any; try { body = await req.json(); } catch { return err('invalid_json', 'Request body must be JSON'); }
  const action = String(body?.action || '').toLowerCase();
  if (!['create','update','submit'].includes(action)) return err('validation_error', 'action must be create|update|submit');

  if (action === 'create') {
    const payload = body?.payload || {};
    // minimal required fields
    if (!payload?.title || !payload?.question || !payload?.solution) {
      return err('validation_error', 'title, question, solution are required');
    }
    const id = uuidv4();
    const now = new Date();
    await cassandra.execute('INSERT INTO user_themes (user_theme_id, author_id, status, payload_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)', [id, user.userId, 'draft', JSON.stringify(payload), now, now], { prepare: true });
    return NextResponse.json({ id, status: 'draft' });
  }

  const id = String(body?.id || '');
  if (!id) return err('validation_error', 'id is required');
  if (action === 'update') {
    const payload = body?.payload || {};
    if (!payload?.title || !payload?.question || !payload?.solution) {
      return err('validation_error', 'title, question, solution are required');
    }
    const now = new Date();
    // ensure author
    const r0 = await cassandra.execute('SELECT author_id, status FROM user_themes WHERE user_theme_id=?', [id], { prepare: true });
    if (r0.rowLength === 0) return err('not_found', 'theme not found', undefined, 404);
    const authorId = r0.first()!.get('author_id');
    const status = r0.first()!.get('status');
    if (authorId !== user.userId) return err('forbidden', 'not owner', undefined, 403);
    if (status !== 'draft') return err('conflict', 'can update only draft', undefined, 409);
    await cassandra.execute('UPDATE user_themes SET payload_json=?, updated_at=? WHERE user_theme_id=?', [JSON.stringify(payload), now, id], { prepare: true });
    return NextResponse.json({ id, status });
  }

  if (action === 'submit') {
    // LWT: status draft -> submitted
    const r = await cassandra.execute('UPDATE user_themes SET status=?, updated_at=? WHERE user_theme_id=? IF status=?', ['submitted', new Date(), id, 'draft'], { prepare: true });
    if (!r.wasApplied()) return err('conflict', 'not in draft or already submitted', undefined, 409);
    return NextResponse.json({ id, status: 'submitted' });
  }
  return err('invalid_action', 'unsupported');
}


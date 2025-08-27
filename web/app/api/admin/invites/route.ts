import { NextResponse } from 'next/server';
import { getCassandra } from '@/lib/cassandra';
import { ensureAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

function err(code: string, message: string, hint?: string, status = 400) { return NextResponse.json({ code, message, hint }, { status }); }

export async function POST(req: Request) {
  let cassandra; try { cassandra = await getCassandra(); await cassandra.connect(); } catch (e: any) { return err('db_unavailable', 'Database connection failed', e?.message, 500); }
  try { await ensureAdmin(cassandra); } catch (r: any) { return r; }
  let body: any; try { body = await req.json(); } catch { return err('invalid_json', 'Request body must be JSON'); }
  const code = String(body?.code || '').trim();
  const maxUses = Number(body?.maxUses || 0);
  const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : null;
  if (!code || !maxUses || maxUses < 1) return err('validation_error', 'code and maxUses are required');
  try {
    await cassandra.execute('INSERT INTO invites_by_code (code, max_uses, expires_at, issued_by, created_at) VALUES (?, ?, ?, ?, ?)', [code, maxUses, expiresAt, 'admin', new Date()], { prepare: true });
    for (let slot = 0; slot < maxUses; slot++) {
      await cassandra.execute('INSERT INTO invite_slots (code, slot, claimed_by, claimed_at) VALUES (?, ?, ?, ?) IF NOT EXISTS', [code, slot, null, null], { prepare: true });
    }
    return NextResponse.json({ ok: true, code, maxUses });
  } catch (e: any) { return err('server_error', 'Unexpected error', e?.message, 500); }
}


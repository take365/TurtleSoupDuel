import { NextResponse } from 'next/server';
import { readUsage } from '@/lib/usage';

export const runtime = 'nodejs';

export async function GET() {
  const info = await readUsage();
  if (!info.userId) {
    return NextResponse.json({ code: 'unauthorized', message: 'No session' }, { status: 401 });
  }
  return NextResponse.json({ today: info.today, total: info.total });
}


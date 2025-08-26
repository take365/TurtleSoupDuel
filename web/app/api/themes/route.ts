import { NextResponse } from 'next/server';
import { getCassandra } from '@/lib/cassandra';

export const runtime = 'nodejs';

function jsonError(code: string, message: string, hint?: string, status = 500) {
  return NextResponse.json({ code, message, hint }, { status });
}

export async function GET() {
  let cassandra;
  try { cassandra = await getCassandra(); await cassandra.connect(); }
  catch (e: any) {
    // Fallback sample when DB not reachable
    return NextResponse.json([
      { themeId: 'sample-1', title: 'サンプル1: なくした鍵', snippet: '鍵はどこへ？', likes: 0, cleared: false },
      { themeId: 'sample-2', title: 'サンプル2: 壊れた時計', snippet: '進まない針の理由', likes: 0, cleared: false },
    ]);
  }

  try {
    const r = await cassandra.execute('SELECT theme_id, title, snippet FROM themes_by_id LIMIT 100');
    const rows = r.rows || [];
    if (!rows.length) {
      return NextResponse.json([
        { themeId: 'sample-1', title: 'サンプル1: なくした鍵', snippet: '鍵はどこへ？', likes: 0, cleared: false },
        { themeId: 'sample-2', title: 'サンプル2: 壊れた時計', snippet: '進まない針の理由', likes: 0, cleared: false },
      ]);
    }
    const data = rows.map((row: any) => ({
      themeId: row.get ? row.get('theme_id') : row.theme_id,
      title: row.get ? row.get('title') : row.title,
      snippet: row.get ? row.get('snippet') : row.snippet,
      likes: 0,
      cleared: false,
    }));
    return NextResponse.json(data);
  } catch (e: any) {
    return jsonError('server_error', 'Failed to load themes', e?.message);
  }
}


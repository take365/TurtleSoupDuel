import { NextResponse } from 'next/server';
import { getCassandra } from '@/lib/cassandra';
import { getUserIdFromCookie } from '@/lib/auth';

export const runtime = 'nodejs';

function jsonError(code: string, message: string, hint?: string, status = 500) {
  return NextResponse.json({ code, message, hint }, { status });
}

export async function GET() {
  let cassandra;
  try { cassandra = await getCassandra(); await cassandra.connect(); }
  catch (e: any) {
    // Fallback sample when DB not reachable
    // NOTE: バックエンドのthemes/に存在するIDに合わせる
    return NextResponse.json([
      { themeId: 'warewareda-0001', title: '２０cm', snippet: '盆栽を一日平均計２０cm移動させる男。なぜ？', likes: 0, cleared: false },
      { themeId: 'warewareda-0002', title: '好奇心', snippet: '自分の寿命を知りたくなった男は死んだ。なぜ？', likes: 0, cleared: false },
    ]);
  }

  try {
    const r = await cassandra.execute('SELECT theme_id, title, snippet FROM themes_by_id LIMIT 100');
    const rows = r.rows || [];
    if (!rows.length) {
      // DBが空の場合も同様に既存テーマのIDを返す
      return NextResponse.json([
        { themeId: 'warewareda-0001', title: '２０cm', snippet: '盆栽を一日平均計２０cm移動させる男。なぜ？', likes: 0, cleared: false },
        { themeId: 'warewareda-0002', title: '好奇心', snippet: '自分の寿命を知りたくなった男は死んだ。なぜ？', likes: 0, cleared: false },
      ]);
    }
    const userId = await getUserIdFromCookie(cassandra);
    const data = [] as any[];
    for (const row of rows) {
      const themeId = row.get ? row.get('theme_id') : row.theme_id;
      const title = row.get ? row.get('title') : row.title;
      const snippet = row.get ? row.get('snippet') : row.snippet;
      // likes counter
      let likes = 0;
      try {
        const rc = await cassandra.execute('SELECT likes FROM theme_like_counts WHERE theme_id=?', [themeId], { prepare: true });
        if (rc.rowLength) likes = Number(rc.first()!.get('likes') || 0);
      } catch {}
      // cleared for current user
      let cleared = false;
      if (userId) {
        try {
          const rr = await cassandra.execute('SELECT theme_id FROM clears_by_user WHERE user_id=? AND theme_id=?', [userId, themeId], { prepare: true });
          cleared = rr.rowLength > 0;
        } catch {}
      }
      data.push({ themeId, title, snippet, likes, cleared });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    return jsonError('server_error', 'Failed to load themes', e?.message);
  }
}

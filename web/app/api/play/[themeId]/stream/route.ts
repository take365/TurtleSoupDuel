export const runtime = 'nodejs';
import { checkLimitAndMaybeIncrement } from '@/lib/usage';
import { getCassandra } from '@/lib/cassandra';
import { ensureActiveUser } from '@/lib/auth';

function sse(data: any) {
  return `event: message\ndata: ${JSON.stringify(data)}\n\n`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(_: Request, { params }: { params: { themeId: string } }) {
  const { themeId } = params;
  // freezeチェック（ログイン必須とする）
  try {
    const c = await getCassandra();
    await c.connect();
    await ensureActiveUser(c);
  } catch (r: any) {
    if (r instanceof Response) return r;
  }
  const dailyLimit = Number(process.env.NEXT_PUBLIC_DAILY_CALL_LIMIT || 100);
  // 1呼び出し=1カウント、トークンはモック値
  const gate = await checkLimitAndMaybeIncrement(dailyLimit, { calls: 1, pt: 0, ot: 0 });
  if (!gate.allowed) {
    return new Response(JSON.stringify({ code: 'rate_limited', message: 'Daily limit exceeded' }), {
      status: 429,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      // Send a few mock events over ~5 seconds
      const events = [
        { actor: 'system', kind: 'note', text: `テーマ ${themeId} を開始します。`, turn: 1, phase: 'start' },
        { actor: 'MC', kind: 'speak', text: 'ようこそ！質問をどうぞ。', turn: 1, phase: 'mc_prompt' },
        { actor: 'user', kind: 'question', text: '現場は屋内ですか？', turn: 1, phase: 'user_question' },
        { actor: 'MC', kind: 'judge', text: 'はい、屋内です。', turn: 1, phase: 'mc_answer' },
        { actor: 'system', kind: 'note', text: 'モックSSE完了。', turn: 1, phase: 'end' },
      ];
      for (const ev of events) {
        controller.enqueue(encoder.encode(sse(ev)));
        await sleep(1000);
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}

"use client";
import { useEffect, useRef, useState } from 'react';

type Ev = { actor: string; kind: string; text: string; turn: number; phase: string };

export default function PlayPage({ params }: { params: { themeId: string } }) {
  const { themeId } = params;
  const [started, setStarted] = useState(false);
  const [events, setEvents] = useState<Ev[]>([]);
  const [input, setInput] = useState('');
  const [limited, setLimited] = useState(false);
  const [liked, setLiked] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [aff, setAff] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    return () => { esRef.current?.close(); };
  }, []);

  const start = () => {
    if (started) return;
    setStarted(true);
    const es = new EventSource(`/api/play/${encodeURIComponent(themeId)}/stream`);
    esRef.current = es;
    es.onmessage = (e) => {
      try { const data = JSON.parse(e.data) as Ev; setEvents((prev) => [...prev, data]); }
      catch { /* ignore */ }
    };
    es.onerror = (err: any) => {
      es.close();
      // 429時はレート制限を表示
      setLimited(true);
    };
  };

  const send = () => {
    if (!input.trim()) return;
    // ひとまずUI上に追加（API送信はM2以降で実装）
    setEvents((prev) => [...prev, { actor: 'user', kind: 'input', text: input, turn: (prev.at(-1)?.turn ?? 1), phase: 'user_input' }]);
    setInput('');
  };

  const like = async () => {
    const r = await fetch(`/api/themes/${encodeURIComponent(themeId)}/like`, { method: 'POST' });
    setLiked(true);
  };
  const unlike = async () => {
    const r = await fetch(`/api/themes/${encodeURIComponent(themeId)}/unlike`, { method: 'POST' });
    setLiked(false);
  };
  const clear = async () => {
    const r = await fetch(`/api/themes/${encodeURIComponent(themeId)}/clear`, { method: 'POST' });
    if (r.ok) setCleared(true);
  };
  const addAffinity = async (d: number) => {
    const r = await fetch(`/api/characters/${encodeURIComponent('char-1')}/affinity`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta: d }) });
    try { const j = await r.json(); if (j && typeof j.score === 'number') setAff(j.score); } catch {}
  };

  return (
    <main className="min-h-screen p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <aside className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">テーマ</h2>
        <div className="text-sm text-gray-600">ID: {themeId}</div>
        <button onClick={start} disabled={started || limited} className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50">
          {started ? '進行中' : '開始'}
        </button>
        {limited && (<div className="text-sm text-red-600">本日の上限に達しました。</div>)}
      </aside>
      <section className="lg:col-span-2 border rounded p-4 flex flex-col gap-3">
        <div className="flex-1 border rounded p-3 bg-gray-50 overflow-auto max-h-[60vh]">
          {events.map((ev, i) => (
            <div key={i} className="mb-2">
              <span className="text-xs text-gray-500">[{ev.turn}:{ev.phase}]</span>{' '}
              <span className="font-semibold">{ev.actor}</span>: {ev.text}
            </div>
          ))}
          {!events.length && <div className="text-gray-400 text-sm">開始ボタンを押してSSEを受信</div>}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <button onClick={liked ? unlike : like} className="border rounded px-2 py-1">{liked ? 'いいね解除' : 'いいね'}</button>
          <button onClick={clear} className="border rounded px-2 py-1" disabled={cleared}>{cleared ? 'クリア済み' : 'クリア記録'}</button>
          <div className="ml-auto flex items-center gap-2">
            <span>好感度{aff != null ? `: ${aff}` : ''}</span>
            <button onClick={() => addAffinity(+5)} className="border rounded px-2 py-1">+5</button>
            <button onClick={() => addAffinity(-5)} className="border rounded px-2 py-1">-5</button>
          </div>
        </div>
        <div className="flex gap-2">
          <input className="flex-1 border rounded px-3 py-2" placeholder="質問や解答を入力" value={input} onChange={(e) => setInput(e.target.value)} disabled={limited} />
          <button onClick={send} className="border rounded px-3 py-2" disabled={limited}>送信</button>
        </div>
      </section>
    </main>
  );
}

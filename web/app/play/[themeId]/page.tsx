"use client";
import { useEffect, useRef, useState } from 'react';

type Ev = { actor: string; kind: string; text: string; turn: number; phase: string };

export default function PlayPage({ params }: { params: { themeId: string } }) {
  const { themeId } = params;
  const [started, setStarted] = useState(false);
  const [events, setEvents] = useState<Ev[]>([]);
  const [input, setInput] = useState('');
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
    es.onerror = () => { es.close(); };
  };

  const send = () => {
    if (!input.trim()) return;
    // ひとまずUI上に追加（API送信はM2以降で実装）
    setEvents((prev) => [...prev, { actor: 'user', kind: 'input', text: input, turn: (prev.at(-1)?.turn ?? 1), phase: 'user_input' }]);
    setInput('');
  };

  return (
    <main className="min-h-screen p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <aside className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">テーマ</h2>
        <div className="text-sm text-gray-600">ID: {themeId}</div>
        <button onClick={start} disabled={started} className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50">
          {started ? '進行中' : '開始'}
        </button>
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
        <div className="flex gap-2">
          <input className="flex-1 border rounded px-3 py-2" placeholder="質問や解答を入力" value={input} onChange={(e) => setInput(e.target.value)} />
          <button onClick={send} className="border rounded px-3 py-2">送信</button>
        </div>
      </section>
    </main>
  );
}


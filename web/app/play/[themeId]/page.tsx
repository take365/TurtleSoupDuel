"use client";
import { useEffect, useRef, useState } from 'react';
import { getApiBase } from '@/lib/api';

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
  const [llmMode, setLlmMode] = useState(false);
  const [phase, setPhase] = useState<string>('');
  const esRef = useRef<EventSource | null>(null);

  // --- Character (manual) ---
  type CharacterConfig = Record<string, any> & {
    display_name?: string;
    initial_text?: string;
  };
  const [charId, setCharId] = useState<string>('ja_butler');
  const charOptions: string[] = ['ja_butler', 'Chip', 'gorou'];
  const [charConfig, setCharConfig] = useState<CharacterConfig | null>(null);
  const [moods, setMoods] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string>('');
  const [autoMood, setAutoMood] = useState<boolean>(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/characters/${charId}/prompts.json`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`failed_to_load:${r.status}`);
        const j = await r.json();
        if (cancelled) return;
        setCharConfig(j);
        const keys = Object.keys(j).filter((k) => (
          k !== 'display_name' && k !== 'initial_text' && j[k] && typeof j[k] === 'object' && j[k].image
        ));
        setMoods(keys);
        const def = keys.includes('平常心') ? '平常心' : (keys[0] || '');
        setSelectedMood((prev) => (prev && keys.includes(prev)) ? prev : def);
      } catch {
        setCharConfig(null);
        setMoods([]);
        setSelectedMood('');
      }
    };
    load();
    return () => { cancelled = true; };
  }, [charId]);

  const resolveImage = () => {
    const cfg: any = charConfig || {};
    const img = cfg?.[selectedMood]?.image || cfg?.['平常心']?.image || (moods.length ? cfg?.[moods[0]]?.image : undefined);
    return img ? `/characters/${charId}/${img}` : '';
  };

  // Infer mood from latest judge/result events (simple heuristic)
  const pickFirstAvailable = (cands: string[], avail: string[]) => {
    for (const c of cands) if (avail.includes(c)) return c;
    if (avail.includes('平常心')) return '平常心';
    return avail[0] || '';
  };
  const inferMoodFromText = (text: string, avail: string[]): string => {
    const t = (text || '').toLowerCase();
    // Positive signals
    if (t.includes('yes') || t.includes('correct') || t.includes('正解') || t.includes('はい')) {
      return pickFirstAvailable(['喜び・勝利', '興味・前進'], avail);
    }
    // Near-miss
    if (t.includes('おしい')) {
      return pickFirstAvailable(['惜しい・再考'], avail);
    }
    // Negative signals
    if (t.includes('no') || t.includes('wrong') || t.includes('不適切') || t.includes('いいえ') || t.includes('不正解') || t.includes('間違')) {
      return pickFirstAvailable(['厳格・注意', '否定・落胆'], avail);
    }
    // Fallback neutral
    return pickFirstAvailable(['平常心'], avail);
  };
  const inferMoodFromEvents = (evs: Ev[], avail: string[]): string => {
    for (let i = evs.length - 1; i >= 0; i--) {
      const e = evs[i];
      if (e.actor === 'MC' && e.kind === 'judge') {
        return inferMoodFromText(e.text || '', avail);
      }
      if (e.actor === 'system' && e.kind === 'note' && /phase=win/i.test(e.text || '')) {
        return pickFirstAvailable(['喜び・勝利', '興味・前進'], avail);
      }
    }
    return selectedMood || pickFirstAvailable(['平常心'], avail);
  };

  useEffect(() => {
    if (!autoMood) return;
    if (!moods.length) return;
    const m = inferMoodFromEvents(events, moods);
    if (m && m !== selectedMood) setSelectedMood(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, autoMood, moods]);

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

  // LLMフロー: FastAPIのゲームAPIを順番に叩く
  const api = getApiBase();
  const startLLM = async () => {
    if (started) return;
    setStarted(true);
    setLlmMode(true);
    setEvents([]);
    try {
      const r = await fetch(`${api}/game/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme_id: themeId, ai_model: process.env.NEXT_PUBLIC_AI_MODEL || 'gpt-4o-mini' }) });
      if (!r.ok) throw new Error('start_failed');
      await refreshState();
      setEvents((prev) => [...prev, { actor: 'system', kind: 'note', text: `テーマ ${themeId} を開始しました`, turn: 1, phase: 'start' }]);
    } catch (e: any) {
      setEvents((prev) => [...prev, { actor: 'system', kind: 'error', text: `開始失敗: ${e.message}`, turn: 1, phase: 'error' }]);
    }
  };

  const refreshState = async () => {
    try {
      const r = await fetch(`${api}/game/state`, { cache: 'no-store' });
      const j = await r.json();
      setPhase(j.phase || '');
    } catch {}
  };

  const sendUserQuestionLLM = async () => {
    const text = input.trim(); if (!text) return;
    setInput('');
    setEvents((p) => [...p, { actor: 'user', kind: 'question', text, turn: (p.at(-1)?.turn ?? 1), phase: 'USER_Q' }]);
    const r = await fetch(`${api}/game/user/question`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    try { const j = await r.json(); if (r.ok) setEvents((p) => [...p, { actor: 'MC', kind: 'judge', text: `${j.judge} ${j.note ? `(${j.note})` : ''}`, turn: (p.at(-1)?.turn ?? 1), phase: 'MC_A' }]); } catch {}
    await refreshState();
  };

  const sendUserGuessLLM = async () => {
    const text = input.trim(); if (!text) return;
    setInput('');
    setEvents((p) => [...p, { actor: 'user', kind: 'guess', text, turn: (p.at(-1)?.turn ?? 1), phase: 'USER_GUESS' }]);
    const r = await fetch(`${api}/game/user/guess`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    try {
      const j = await r.json();
      if (r.ok) {
        setEvents((p) => [...p, { actor: 'MC', kind: 'judge', text: j.result, turn: (p.at(-1)?.turn ?? 1), phase: 'MC_JUDGE' }]);
      }
    } catch {}
    await refreshState();
  };

  const aiQuestionLLM = async () => {
    const r = await fetch(`${api}/game/ai/question`, { method: 'POST' });
    try { const j = await r.json(); if (r.ok) setEvents((p) => [...p, { actor: 'ai', kind: 'question', text: j.text, turn: (p.at(-1)?.turn ?? 1), phase: 'AI_Q' }]); } catch {}
    await refreshState();
  };

  const aiGuessLLM = async () => {
    const r = await fetch(`${api}/game/ai/guess`, { method: 'POST' });
    try { const j = await r.json(); if (r.ok) setEvents((p) => [...p, { actor: 'ai', kind: 'guess', text: j.text, turn: (p.at(-1)?.turn ?? 1), phase: 'AI_GUESS' }]); } catch {}
    await refreshState();
  };

  const nextTurnLLM = async () => {
    const r = await fetch(`${api}/game/next`, { method: 'POST' });
    try { const j = await r.json(); if (r.ok) setEvents((p) => [...p, { actor: 'system', kind: 'note', text: `phase=${j.phase} turn=${j.turn}`, turn: j.turn, phase: j.phase }]); } catch {}
    await refreshState();
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
    const r = await fetch(`/api/characters/${encodeURIComponent(charId)}/affinity`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ delta: d }) });
    try { const j = await r.json(); if (j && typeof j.score === 'number') setAff(j.score); } catch {}
  };

  return (
    <main className="min-h-screen p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
      <aside className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">テーマ</h2>
        <div className="text-sm text-gray-600">ID: {themeId}</div>
        <div className="flex flex-col gap-2">
          <button onClick={start} disabled={started || limited} className="bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50">
            {started && !llmMode ? '進行中' : 'モック開始'}
          </button>
          <button onClick={startLLM} disabled={started} className="bg-purple-600 text-white rounded px-3 py-2 disabled:opacity-50">
            {started && llmMode ? 'LLM進行中' : 'LLM進行で開始'}
          </button>
        </div>
        {limited && (<div className="text-sm text-red-600">本日の上限に達しました。</div>)}
        {llmMode && (<div className="text-xs text-gray-500">phase: {phase || '-'}</div>)}

        <div className="my-3 border-t pt-3 space-y-2">
          <h3 className="font-semibold">キャラ（手動）</h3>
          <label className="inline-flex items-center gap-2 text-sm">
            <input type="checkbox" checked={autoMood} onChange={(e) => setAutoMood(e.target.checked)} /> 自動切替
          </label>
          <label className="block text-sm">
            キャラ
            <select
              className="mt-1 w-full border rounded px-2 py-1"
              value={charId}
              onChange={(e) => setCharId(e.target.value)}
            >
              {charOptions.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="text-sm text-gray-600">{charConfig?.display_name || charId}</div>
          <label className="block text-sm">
            感情
            <select
              className="mt-1 w-full border rounded px-2 py-1"
              value={selectedMood}
              onChange={(e) => setSelectedMood(e.target.value)}
              disabled={autoMood}
            >
              {moods.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <div className="border rounded overflow-hidden bg-white">
            {resolveImage() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveImage()} alt={selectedMood || '立ち絵'} className="w-full h-auto object-contain" />
            ) : (
              <div className="p-4 text-center text-gray-400 text-sm">画像なし</div>
            )}
          </div>
        </div>
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
        {!llmMode && (
          <div className="flex gap-2">
            <input className="flex-1 border rounded px-3 py-2" placeholder="質問や解答を入力" value={input} onChange={(e) => setInput(e.target.value)} disabled={limited} />
            <button onClick={send} className="border rounded px-3 py-2" disabled={limited}>送信</button>
          </div>
        )}
        {llmMode && (
          <div className="space-y-2">
            <div className="flex gap-2">
              <input className="flex-1 border rounded px-3 py-2" placeholder="質問/解答を入力（ユーザ用）" value={input} onChange={(e) => setInput(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 text-sm">
              <button onClick={sendUserQuestionLLM} className="border rounded px-2 py-1">ユーザ質問→判定</button>
              <button onClick={sendUserGuessLLM} className="border rounded px-2 py-1">ユーザ最終解答→判定</button>
              <button onClick={aiQuestionLLM} className="border rounded px-2 py-1">AIに質問させる</button>
              <button onClick={aiGuessLLM} className="border rounded px-2 py-1">AIに解答させる</button>
              <button onClick={nextTurnLLM} className="border rounded px-2 py-1">次のターンへ</button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

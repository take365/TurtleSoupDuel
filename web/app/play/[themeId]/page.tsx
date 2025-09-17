"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getApiBase } from '@/lib/api';

type Ev = { actor: string; kind: string; text: string; turn: number; phase: string };

type ThemeInfo = {
  id: string;
  title: string;
  question: string;
};

type CharacterConfig = Record<string, any> & {
  display_name?: string;
  initial_text?: string;
};

export default function PlayPage({ params }: { params: { themeId: string } }) {
  const { themeId } = params;
  const searchParams = useSearchParams();
  const initialChar = searchParams.get('char') || 'ja_butler';

  const [events, setEvents] = useState<Ev[]>([]);
  const [input, setInput] = useState('');
  const [liked, setLiked] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [aff, setAff] = useState<number | null>(null);
  const [phase, setPhase] = useState<string>('');
  const [charId, setCharId] = useState<string>(initialChar);
  const [charConfig, setCharConfig] = useState<CharacterConfig | null>(null);
  const [moods, setMoods] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string>('');
  const [themeInfo, setThemeInfo] = useState<ThemeInfo | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);

  const api = useMemo(() => getApiBase(), []);

  useEffect(() => {
    setCharId(initialChar);
  }, [initialChar]);

  useEffect(() => {
    let cancelled = false;
    const loadTheme = async () => {
      try {
        const r = await fetch(`${api}/themes/${encodeURIComponent(themeId)}`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`theme_failed:${r.status}`);
        const j = await r.json();
        if (cancelled) return;
        setThemeInfo({ id: j.id || themeId, title: j.title || themeId, question: j.question || '' });
      } catch (e: any) {
        if (!cancelled) setThemeError(e?.message || 'テーマを取得できませんでした');
      }
    };
    loadTheme();
    return () => {
      cancelled = true;
    };
  }, [api, themeId]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/characters/${charId}/prompts.json`, { cache: 'no-store' });
        if (!r.ok) throw new Error(`prompts_failed:${r.status}`);
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
        if (!cancelled) {
          setCharConfig(null);
          setMoods([]);
          setSelectedMood('');
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [charId]);

  const resolveImage = () => {
    const cfg: any = charConfig || {};
    const img = cfg?.[selectedMood]?.image || cfg?.['平常心']?.image || (moods.length ? cfg?.[moods[0]]?.image : undefined);
    return img ? `/characters/${charId}/${img}` : '';
  };

  const pickFirstAvailable = (cands: string[], avail: string[]) => {
    for (const c of cands) if (avail.includes(c)) return c;
    if (avail.includes('平常心')) return '平常心';
    return avail[0] || '';
  };

  const inferMoodFromText = (text: string, avail: string[]): string => {
    const t = (text || '').toLowerCase();
    if (t.includes('yes') || t.includes('correct') || t.includes('正解') || t.includes('はい')) {
      return pickFirstAvailable(['喜び・勝利', '興味・前進'], avail);
    }
    if (t.includes('おしい')) {
      return pickFirstAvailable(['惜しい・再考'], avail);
    }
    if (t.includes('no') || t.includes('wrong') || t.includes('不適切') || t.includes('いいえ') || t.includes('不正解') || t.includes('間違')) {
      return pickFirstAvailable(['厳格・注意', '否定・落胆'], avail);
    }
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
    if (!moods.length) return;
    const m = inferMoodFromEvents(events, moods);
    if (m && m !== selectedMood) setSelectedMood(m);
  }, [events, moods, selectedMood]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [events]);

  useEffect(() => {
    if (!themeInfo) return;
    setEvents((prev) => {
      if (prev.length) return prev;
      return [
        {
          actor: 'system',
          kind: 'note',
          text: `テーマ「${themeInfo.title}」を開始しました`,
          turn: 1,
          phase: 'start',
        },
      ];
    });
  }, [themeInfo]);

  const refreshState = useCallback(async () => {
    try {
      const r = await fetch(`${api}/game/state`, { cache: 'no-store' });
      if (!r.ok) throw new Error('state_failed');
      const j = await r.json();
      setPhase(j.phase || '');
    } catch {
      /* ignore */
    }
  }, [api]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  const sendUserQuestionLLM = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setEvents((p) => [...p, { actor: 'user', kind: 'question', text, turn: (p.at(-1)?.turn ?? 1), phase: 'USER_Q' }]);
    const r = await fetch(`${api}/game/user/question`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    try {
      const j = await r.json();
      if (r.ok) {
        setEvents((p) => {
          const turn = p.at(-1)?.turn ?? 1;
          return [...p, { actor: 'MC', kind: 'judge', text: `${j.judge}${j.note ? ` (${j.note})` : ''}`, turn, phase: 'MC_A' }];
        });
      }
    } catch {
      /* ignore */
    }
    await refreshState();
  };

  const sendUserGuessLLM = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    setEvents((p) => [...p, { actor: 'user', kind: 'guess', text, turn: (p.at(-1)?.turn ?? 1), phase: 'USER_GUESS' }]);
    const r = await fetch(`${api}/game/user/guess`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    try {
      const j = await r.json();
      if (r.ok) {
        setEvents((p) => [...p, { actor: 'MC', kind: 'judge', text: j.result, turn: (p.at(-1)?.turn ?? 1), phase: 'MC_JUDGE' }]);
      }
    } catch {
      /* ignore */
    }
    await refreshState();
  };

  const aiQuestionLLM = async () => {
    const r = await fetch(`${api}/game/ai/question`, { method: 'POST' });
    try {
      const j = await r.json();
      if (r.ok) {
        setEvents((p) => {
          const turn = p.at(-1)?.turn ?? 1;
          const next = [...p, { actor: 'ai', kind: 'question', text: j.text, turn, phase: 'AI_Q' }];
          if (j.judge) {
            const note = j.note ? ` (${j.note})` : '';
            next.push({ actor: 'MC', kind: 'judge', text: `${j.judge}${note}`, turn, phase: 'AI_MC_A' });
          }
          return next;
        });
      }
    } catch {
      /* ignore */
    }
    await refreshState();
  };

  const aiGuessLLM = async () => {
    const r = await fetch(`${api}/game/ai/guess`, { method: 'POST' });
    try {
      const j = await r.json();
      if (r.ok) {
        setEvents((p) => {
          const turn = p.at(-1)?.turn ?? 1;
          const next = [...p, { actor: 'ai', kind: 'guess', text: j.text, turn, phase: 'AI_GUESS' }];
          if (j.result) {
            next.push({ actor: 'MC', kind: 'judge', text: j.result, turn, phase: 'AI_MC_JUDGE' });
          }
          return next;
        });
      }
    } catch {
      /* ignore */
    }
    await refreshState();
  };

  const nextTurnLLM = async () => {
    const r = await fetch(`${api}/game/next`, { method: 'POST' });
    try {
      const j = await r.json();
      if (r.ok) {
        setEvents((p) => [...p, { actor: 'system', kind: 'note', text: `phase=${j.phase} turn=${j.turn}`, turn: j.turn, phase: j.phase }]);
        setPhase(j.phase || '');
      }
    } catch {
      /* ignore */
    }
  };

  const like = async () => {
    const r = await fetch(`/api/themes/${encodeURIComponent(themeId)}/like`, { method: 'POST' });
    if (r.ok) setLiked(true);
  };

  const unlike = async () => {
    const r = await fetch(`/api/themes/${encodeURIComponent(themeId)}/unlike`, { method: 'POST' });
    if (r.ok) setLiked(false);
  };

  const clear = async () => {
    const r = await fetch(`/api/themes/${encodeURIComponent(themeId)}/clear`, { method: 'POST' });
    if (r.ok) setCleared(true);
  };

  const addAffinity = async (d: number) => {
    const r = await fetch(`/api/characters/${encodeURIComponent(charId)}/affinity`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ delta: d }),
    });
    try {
      const j = await r.json();
      if (j && typeof j.score === 'number') setAff(j.score);
    } catch {
      /* ignore */
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-4 lg:p-6">
      <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[2fr_minmax(0,1.15fr)]">
        <section className="flex flex-col gap-4">
          <div ref={logRef} className="flex-1 border rounded-lg bg-white p-4 overflow-auto max-h-[70vh]">
            {events.map((ev, i) => (
              <div key={`${ev.actor}-${ev.kind}-${i}`} className="mb-3">
                <div className="text-xs text-slate-400">[{ev.turn}:{ev.phase}]</div>
                <div className="font-semibold text-slate-700">{ev.actor}</div>
                <div className="text-sm text-slate-800 whitespace-pre-wrap">{ev.text}</div>
              </div>
            ))}
            {!events.length && <div className="text-sm text-slate-400">会話はまだありません。入力して開始してください。</div>}
          </div>
          <div className="border rounded-lg bg-white p-4 space-y-3">
            <textarea
              className="w-full border rounded px-3 py-2 text-sm"
              rows={3}
              placeholder="質問や最終解答を入力"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <div className="flex flex-wrap gap-2 text-sm">
              <button onClick={sendUserQuestionLLM} className="border rounded px-3 py-2 bg-blue-600 text-white">質問として送信</button>
              <button onClick={sendUserGuessLLM} className="border rounded px-3 py-2 bg-emerald-600 text-white">最終解答として送信</button>
              <button onClick={aiQuestionLLM} className="border rounded px-3 py-2">AIに質問させる</button>
              <button onClick={aiGuessLLM} className="border rounded px-3 py-2">AIに解答させる</button>
              <button onClick={nextTurnLLM} className="border rounded px-3 py-2">次のターンへ</button>
            </div>
          </div>
        </section>
        <aside className="space-y-4">
          <div className="border rounded-lg bg-white p-4 space-y-3">
            <h2 className="text-lg font-semibold">問題情報</h2>
            <div className="text-sm text-slate-600">ID: {themeInfo?.id || themeId}</div>
            <div className="text-xl font-bold text-slate-800">{themeInfo?.title || '読み込み中…'}</div>
            {themeError && <div className="text-sm text-red-600">{themeError}</div>}
            <div className="text-sm text-slate-700 whitespace-pre-wrap">{themeInfo?.question || ''}</div>
            <div className="text-xs text-slate-500">phase: {phase || '-'}</div>
          </div>
          <div className="border rounded-lg bg-white p-4 space-y-3">
            <h2 className="text-lg font-semibold">キャラクター</h2>
            <div className="text-sm text-slate-600">{charConfig?.display_name || charId}</div>
            <div className="text-xs text-slate-500">感情（自動）: {selectedMood || '-'}</div>
            {resolveImage() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveImage()} alt={selectedMood || '立ち絵'} className="w-full rounded border" />
            ) : (
              <div className="border rounded p-4 text-center text-xs text-slate-400">立ち絵はありません</div>
            )}
          </div>
          <div className="border rounded-lg bg-white p-4 space-y-3 text-sm">
            <div className="flex gap-2">
              <button onClick={liked ? unlike : like} className="border rounded px-3 py-2">
                {liked ? 'いいね解除' : 'いいね'}
              </button>
              <button onClick={clear} className="border rounded px-3 py-2" disabled={cleared}>
                {cleared ? 'クリア済み' : 'クリア記録'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span>好感度{aff != null ? `: ${aff}` : ''}</span>
              <button onClick={() => addAffinity(+5)} className="border rounded px-2 py-1">+5</button>
              <button onClick={() => addAffinity(-5)} className="border rounded px-2 py-1">-5</button>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}


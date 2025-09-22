"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { getApiBase } from '@/lib/api';

type Ev = { actor: string; kind: string; text: string; turn: number; phase: string };

const formatJudgeResult = (result: string | null | undefined): string => {
  if (result === 'CORRECT') return 'おめでとうございます！正解です。';
  if (result === 'WRONG') return '残念違います。';
  return result || '';
};

type ThemeInfo = {
  id: string;
  title: string;
  question: string;
};

type CharacterConfig = Record<string, any> & {
  display_name?: string;
  initial_text?: string;
};

type ActorMeta = {
  label: string;
  icons: string[];
  fallback: string;
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
  const [turn, setTurn] = useState<number>(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [autoProcessing, setAutoProcessing] = useState(false);
  const [charId, setCharId] = useState<string>(initialChar);
  const [charConfig, setCharConfig] = useState<CharacterConfig | null>(null);
  const [moods, setMoods] = useState<string[]>([]);
  const [selectedMood, setSelectedMood] = useState<string>('');
  const [themeInfo, setThemeInfo] = useState<ThemeInfo | null>(null);
  const [themeError, setThemeError] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement | null>(null);
  const [outcome, setOutcome] = useState<"user" | "ai" | "draw" | null>(null);

  const api = useMemo(() => getApiBase(), []);

  useEffect(() => {
    setCharId(initialChar);
  }, [initialChar]);

  useEffect(() => {
    setOutcome(null);
    setPhase('');
    setTurn(1);
    setAutoProcessing(false);
  }, [themeId]);

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

  const characterIconCandidates = useMemo(() => {
    const base = `/characters/${charId}/`;
    const variants = new Set<string>();
    const avatarName = typeof charConfig?.avatar === 'string' ? charConfig.avatar : '';
    if (avatarName) {
      variants.add(avatarName);
    }
    variants.add(`${charId}.png`);
    variants.add(`${charId.toLowerCase()}.png`);
    variants.add(`${charId.replace(/-/g, '_')}.png`);
    variants.add(`${charId.replace(/_/g, '')}.png`);
    variants.add(`${charId.replace(/^ja_/, '')}.png`);
    const cfg = charConfig || {};
    Object.values(cfg).forEach((val) => {
      if (val && typeof val === 'object' && 'image' in val && typeof (val as any).image === 'string') {
        variants.add((val as any).image as string);
      }
    });
    return Array.from(variants)
      .filter(Boolean)
      .map((name) => `${base}${name}`);
  }, [charId, charConfig]);

  const userIconCandidates = useMemo(() => {
    return [] as string[];
  }, []);

  const mcIconCandidates = useMemo(() => {
    return Array.from(new Set([`/avatars/mc.png`, ...characterIconCandidates]));
  }, [characterIconCandidates]);

  const aiIconCandidates = useMemo(() => {
    if (characterIconCandidates.length) return characterIconCandidates;
    return ['/avatars/ai.png'];
  }, [characterIconCandidates]);

  const actorMeta = useMemo<Record<string, ActorMeta>>(() => {
    return {
      user: { label: 'ユーザー', icons: userIconCandidates, fallback: 'U' },
      mc: { label: 'MC', icons: mcIconCandidates, fallback: 'MC' },
      ai: { label: charConfig?.display_name || 'AI', icons: aiIconCandidates, fallback: 'AI' },
      system: { label: 'システム', icons: [], fallback: 'S' },
      default: { label: 'メッセージ', icons: [], fallback: '?' },
    };
  }, [aiIconCandidates, charConfig, mcIconCandidates, userIconCandidates]);

  const Avatar = ({ actorKey, icons, fallback, title }: { actorKey: string; icons: string[]; fallback: string; title: string }) => {
    const [index, setIndex] = useState<number>(0);
    const prevKeyRef = useRef<string | null>(null);
    useEffect(() => {
      const key = `${actorKey}|${icons.join('|')}`;
      if (prevKeyRef.current !== key) {
        setIndex(0);
        prevKeyRef.current = key;
      }
    }, [actorKey, icons]);
    const src = index >= 0 ? icons[index] : undefined;
    if (!src) {
      return (
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-100 text-xs text-slate-500"
          title={title}
        >
          {fallback}
        </div>
      );
    }
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`${actorKey}-${index}`}
        src={src}
        alt={actorKey}
        className="h-10 w-10 border border-slate-200 object-cover bg-white"
        title={title}
        onError={() =>
          setIndex((prev) => {
            const next = prev + 1;
            return next < icons.length ? next : -1;
          })
        }
      />
    );
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
    if (
      t.includes('no') ||
      t.includes('wrong') ||
      t.includes('不適切') ||
      t.includes('いいえ') ||
      t.includes('不正解') ||
      t.includes('間違') ||
      t.includes('違います')
    ) {
      return pickFirstAvailable(['厳格・注意', '否定・落胆'], avail);
    }
    return pickFirstAvailable(['平常心'], avail);
  };

  const inferMoodFromEvents = (evs: Ev[], avail: string[]): string => {
    for (let i = evs.length - 1; i >= 0; i--) {
      const e = evs[i];
      const actorKey = (e.actor || '').toLowerCase();
      if (actorKey === 'mc' && e.kind === 'judge') {
        return inferMoodFromText(e.text || '', avail);
      }
      if (actorKey === 'system' && e.kind === 'note' && /phase=win/i.test(e.text || '')) {
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
          actor: 'mc',
          kind: 'note',
          text: `それではテーマ「${themeInfo.title}」で勝負を開始します。`,
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
      if (typeof j.turn === 'number' && j.turn > 0) {
        setTurn(j.turn);
      }
      return j;
    } catch {
      /* ignore */
      return null;
    }
  }, [api]);

  useEffect(() => {
    refreshState();
  }, [refreshState]);

  useEffect(() => {
    let cancelled = false;
    const loadProgress = async () => {
      try {
        const r = await fetch('/api/themes', { cache: 'no-store' });
        if (!r.ok) return;
        const list = await r.json();
        if (!Array.isArray(list) || cancelled) return;
        const entry = list.find((item: any) => item?.themeId === themeId);
        if (entry) {
          if (typeof entry.cleared === 'boolean') {
            setCleared(entry.cleared);
          }
          if (typeof entry.liked === 'boolean') {
            setLiked(entry.liked);
          }
        }
      } catch {
        /* ignore */
      }
    };
    loadProgress();
    return () => {
      cancelled = true;
    };
  }, [themeId]);

  const sendUserQuestionLLM = useCallback(async () => {
    if (phase !== 'USER_Q' || isSubmitting) return;
    const text = input.trim();
    if (!text) return;
    setIsSubmitting(true);
    setInput('');
    setEvents((p) => {
      const currentTurn = turn || (p.at(-1)?.turn ?? 1);
      return [...p, { actor: 'user', kind: 'question', text, turn: currentTurn, phase: 'USER_Q' }];
    });
    try {
      const r = await fetch(`${api}/game/user/question`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      try {
        const j = await r.json();
        if (r.ok) {
          setEvents((p) => {
            const currentTurn = turn || (p.at(-1)?.turn ?? 1);
            const judge = j.judge ?? '';
            const note = j.note ? ` (${j.note})` : '';
            return [
              ...p,
              {
                actor: 'mc',
                kind: 'judge',
                text: `${judge}${note}`,
                turn: currentTurn,
                phase: 'MC_A',
              },
            ];
          });
          setPhase('USER_GUESS');
        }
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    await refreshState();
    setIsSubmitting(false);
  }, [api, input, isSubmitting, phase, refreshState, turn]);

  const sendUserGuessLLM = useCallback(async () => {
    if (phase !== 'USER_GUESS' || isSubmitting) return;
    const text = input.trim();
    if (!text) return;
    setIsSubmitting(true);
    setInput('');
    setEvents((p) => {
      const currentTurn = turn || (p.at(-1)?.turn ?? 1);
      return [...p, { actor: 'user', kind: 'guess', text, turn: currentTurn, phase: 'USER_GUESS' }];
    });
    try {
      const r = await fetch(`${api}/game/user/guess`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      try {
        const j = await r.json();
        if (r.ok) {
          setEvents((p) => {
            const currentTurn = turn || (p.at(-1)?.turn ?? 1);
            const next = [
              ...p,
              {
                actor: 'mc',
                kind: 'judge',
                text: formatJudgeResult(j.result),
                turn: currentTurn,
                phase: 'MC_JUDGE',
              },
            ];
            if (j.explanation) {
              next.push({ actor: 'mc', kind: 'note', text: j.explanation, turn: currentTurn, phase: 'MC_EXPLAIN' });
            }
            return next;
          });
          if (j.is_win && j.winner === 'user') {
            setOutcome('user');
            setPhase('WIN');
          } else if (j.is_draw) {
            setOutcome('draw');
            setPhase('DRAW');
          } else {
            setPhase('AI_Q');
          }
        }
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    await refreshState();
    setIsSubmitting(false);
  }, [api, input, isSubmitting, phase, refreshState, turn]);

  const aiQuestionLLM = useCallback(async () => {
    try {
      const r = await fetch(`${api}/game/ai/question`, { method: 'POST' });
      try {
        const j = await r.json();
        if (r.ok) {
          setEvents((p) => {
            const currentTurn = turn || (p.at(-1)?.turn ?? 1);
            const next = [...p, { actor: 'ai', kind: 'question', text: j.text, turn: currentTurn, phase: 'AI_Q' }];
            if (j.judge) {
              const note = j.note ? ` (${j.note})` : '';
              next.push({ actor: 'mc', kind: 'judge', text: `${j.judge}${note}`, turn: currentTurn, phase: 'AI_MC_A' });
            }
            return next;
          });
          setPhase('AI_GUESS');
        }
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    await refreshState();
  }, [api, refreshState, turn]);

  const aiGuessLLM = useCallback(async () => {
    try {
      const r = await fetch(`${api}/game/ai/guess`, { method: 'POST' });
      try {
        const j = await r.json();
        if (r.ok) {
          setEvents((p) => {
            const currentTurn = turn || (p.at(-1)?.turn ?? 1);
            const next = [...p, { actor: 'ai', kind: 'guess', text: j.text, turn: currentTurn, phase: 'AI_GUESS' }];
            if (j.result) {
              next.push({ actor: 'mc', kind: 'judge', text: formatJudgeResult(j.result), turn: currentTurn, phase: 'AI_MC_JUDGE' });
              if (j.explanation) {
                next.push({ actor: 'mc', kind: 'note', text: j.explanation, turn: currentTurn, phase: 'MC_EXPLAIN' });
              }
            }
            return next;
          });
          if (j.is_win && j.winner === 'ai') {
            setOutcome('ai');
            setPhase('WIN');
          } else if (j.is_draw) {
            setOutcome('draw');
            setPhase('DRAW');
          } else {
            setPhase('USER_Q');
          }
        }
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
    await refreshState();
  }, [api, refreshState, turn]);

  useEffect(() => {
    if (autoProcessing) return;
    if (phase !== 'AI_Q' && phase !== 'AI_GUESS') return;
    let cancelled = false;
    const run = async () => {
      setAutoProcessing(true);
      try {
        if (phase === 'AI_Q') {
          await aiQuestionLLM();
        } else if (phase === 'AI_GUESS') {
          await aiGuessLLM();
        }
      } finally {
        if (!cancelled) {
          setAutoProcessing(false);
        }
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [aiGuessLLM, aiQuestionLLM, autoProcessing, phase]);

  const toggleLike = async () => {
    const endpoint = liked ? 'unlike' : 'like';
    const r = await fetch(`/api/themes/${encodeURIComponent(themeId)}/${endpoint}`, { method: 'POST' });
    if (r.ok) {
      setLiked(!liked);
    }
  };

  const toggleCleared = async () => {
    const method = cleared ? 'DELETE' : 'POST';
    const r = await fetch(`/api/themes/${encodeURIComponent(themeId)}/clear`, { method });
    if (r.ok) {
      setCleared(!cleared);
      return;
    }
    if (!cleared && r.status === 409) {
      setCleared(true);
    }
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

  const outcomeImages: Record<'user' | 'ai' | 'draw', string> = {
    user: '/youwin.png',
    ai: '/youlose.png',
    draw: '/draw.png',
  };

  return (
    <>
      <main className="min-h-screen bg-slate-100 p-4 lg:p-6">
        <div className="max-w-6xl mx-auto grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_2fr]">
          <aside className="space-y-4">
            <div className="border rounded-lg bg-white p-4 space-y-3">
              <h2 className="text-lg font-semibold">対戦キャラクター</h2>
              <div className="text-sm text-slate-600">{charConfig?.display_name || charId}</div>
            <div className="text-xs text-slate-500">感情（自動）: {selectedMood || '-'}</div>
            {resolveImage() ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={resolveImage()} alt={selectedMood || '立ち絵'} className="w-4/5 mx-auto border bg-white block" />
            ) : (
              <div className="border rounded p-4 text-center text-xs text-slate-400">立ち絵はありません</div>
            )}
          </div>
          <div className="border rounded-lg bg-white p-4 space-y-4 text-sm">
            <div className="space-y-2">
              <div className="text-xl font-bold text-slate-800">{themeInfo?.title || '読み込み中…'}</div>
              {themeError && <div className="text-sm text-red-600">{themeError}</div>}
              <div className="text-slate-700 whitespace-pre-wrap">{themeInfo?.question || ''}</div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={toggleLike}
                className="border rounded px-3 py-2"
                aria-label={liked ? 'いいねを解除' : 'いいねする'}
                title={liked ? 'いいね解除' : 'いいね'}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={liked ? '/good.png' : '/nogood.png'}
                  alt={liked ? 'いいね済み' : '未いいね'}
                  className="h-6 w-6"
                />
              </button>
              <button
                onClick={toggleCleared}
                className="border rounded px-3 py-2"
                aria-label={cleared ? 'クリア済みを解除' : 'クリアとして記録'}
                title={cleared ? 'クリア済み' : '未クリア'}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cleared ? '/crear.png' : '/nocrear.png'}
                  alt={cleared ? 'クリア済み' : '未クリア'}
                  className="h-6 w-6"
                />
              </button>
            </div>
            <div className="flex items-center gap-2">
              <span>好感度{aff != null ? `: ${aff}` : ''}</span>
              <button onClick={() => addAffinity(+5)} className="border rounded px-2 py-1">+5</button>
              <button onClick={() => addAffinity(-5)} className="border rounded px-2 py-1">-5</button>
            </div>
          </div>
        </aside>
        <section className="flex flex-col gap-4">
          <div ref={logRef} className="flex-1 border rounded-lg bg-white p-4 overflow-auto max-h-[56vh] space-y-3">
            {events.map((ev, i) => {
              const actorKey = (ev.actor || '').toLowerCase();
              const meta = actorMeta[actorKey] || actorMeta.default;
              const label = meta === actorMeta.default && ev.actor ? ev.actor : meta.label;
              const isUser = actorKey === 'user';
              const isMC = actorKey === 'mc';
              const isAI = actorKey === 'ai';
              const laneClass = ['flex', isUser ? 'justify-end pl-12' : 'justify-start pr-12'].join(' ');
              const itemClass = ['flex items-start gap-3', isUser ? 'flex-row-reverse' : ''].join(' ');
              const bubbleClass = [
                'rounded-lg px-3 py-2 text-sm text-slate-800 whitespace-pre-wrap shadow-sm',
                isUser
                  ? 'bg-blue-100 text-left max-w-[70%] lg:max-w-[66%] ml-auto'
                  : isMC
                  ? 'bg-emerald-100 max-w-[72%]'
                  : isAI
                  ? 'bg-rose-100 max-w-[72%]'
                  : 'bg-slate-100 max-w-[72%]'
              ].join(' ');
              return (
                <div key={`${ev.actor}-${ev.kind}-${i}`} className={laneClass}>
                  <div className={itemClass}>
                    <Avatar actorKey={actorKey} icons={meta.icons} fallback={meta.fallback} title={label} />
                    <div className={bubbleClass}>{ev.text}</div>
                  </div>
                </div>
              );
            })}
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
              <button
                onClick={sendUserQuestionLLM}
                disabled={phase !== 'USER_Q' || isSubmitting || autoProcessing}
                className="border rounded px-3 py-2 bg-blue-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                質問として送信
              </button>
              <button
                onClick={sendUserGuessLLM}
                disabled={phase !== 'USER_GUESS' || isSubmitting || autoProcessing}
                className="border rounded px-3 py-2 bg-emerald-600 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              >
                最終解答として送信
              </button>
            </div>
          </div>
        </section>
      </div>
      </main>
      {outcome && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm cursor-pointer"
          onClick={() => setOutcome(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={outcomeImages[outcome]}
            alt={outcome === 'draw' ? 'Draw' : outcome === 'user' ? 'You Win' : 'You Lose'}
            className="max-w-[80vw] max-h-[80vh] drop-shadow-2xl"
          />
        </div>
      )}
    </>
  );
}

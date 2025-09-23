"use client";

import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBase } from '@/lib/api';

type ThemeItem = {
  themeId: string;
  title: string;
  snippet?: string;
  question?: string; // 念のため受け取れるように
  likes?: number;
  liked?: boolean;
  cleared?: boolean;
};

type CharacterConfig = Record<string, any> & {
  display_name?: string;
};

type Props = {
  themes: ThemeItem[];
};

const CHARACTER_OPTIONS: { id: string; label: string }[] = [
  { id: 'ja_butler', label: '執事・八朔' },
  { id: 'Chip', label: 'Chip' },
  { id: 'gorou', label: 'ごろう' },
];

export default function SelectionScreen({ themes }: Props) {
  const router = useRouter();
  const api = useMemo(() => getApiBase(), []);
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [selectedChar, setSelectedChar] = useState<string>('ja_butler');
  const [charConfig, setCharConfig] = useState<CharacterConfig | null>(null);
  const [charImage, setCharImage] = useState<string>('');
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<ThemeItem[]>(themes);
  const [hideCleared, setHideCleared] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem('turtlesoupduel:hide-cleared');
      if (stored === 'true') {
        setHideCleared(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem('turtlesoupduel:hide-cleared', hideCleared ? 'true' : 'false');
    } catch {
      /* ignore */
    }
  }, [hideCleared]);

  useEffect(() => {
    setItems(themes);
  }, [themes]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/characters/${selectedChar}/prompts.json`, { cache: 'no-store' });
        if (!r.ok) throw new Error('failed');
        const j = await r.json();
        if (cancelled) return;
        setCharConfig(j);
        const moods = Object.keys(j).filter((k) => j[k]?.image);
        const fallback = j['平常心']?.image || (moods.length ? j[moods[0]]?.image : undefined);
        setCharImage(fallback ? `/characters/${selectedChar}/${fallback}` : '');
      } catch {
        if (!cancelled) {
          setCharConfig(null);
          setCharImage('');
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedChar]);

  const startGame = async () => {
    if (!selectedTheme || starting) return;
    setStarting(true);
    setError(null);
    try {
      const body = {
        theme_id: selectedTheme,
        ai_model: process.env.NEXT_PUBLIC_AI_MODEL || 'gpt-4o-mini',
      };
      const r = await fetch(`${api}/game/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const text = await r.text();
        throw new Error(text || `start_failed:${r.status}`);
      }
      router.push(`/play/${encodeURIComponent(selectedTheme)}?char=${encodeURIComponent(selectedChar)}`);
    } catch (e: any) {
      setError(e?.message || '開始に失敗しました');
    } finally {
      setStarting(false);
    }
  };

  const toggleCleared = async (themeId: string, cleared: boolean | undefined) => {
    const nextState = !cleared;
    setError(null);
    try {
      const r = await fetch(`/api/themes/${encodeURIComponent(themeId)}/clear`, {
        method: nextState ? 'POST' : 'DELETE',
      });
      if (!r.ok && !(r.status === 409 && nextState)) {
        throw new Error(`toggle_failed:${r.status}`);
      }
      setItems((prev) => prev.map((t) => (t.themeId === themeId ? { ...t, cleared: nextState } : t)));
    } catch (e: any) {
      setError(e?.message ? `クリア状態の更新に失敗しました (${e.message})` : 'クリア状態の更新に失敗しました');
    }
  };

  useEffect(() => {
    if (!hideCleared) return;
    if (!selectedTheme) return;
    const current = items.find((t) => t.themeId === selectedTheme);
    if (current && current.cleared) {
      setSelectedTheme(null);
    }
  }, [hideCleared, items, selectedTheme]);

  const toggleLiked = async (themeId: string, liked: boolean | undefined) => {
    const nextState = !liked;
    setError(null);
    try {
      const endpoint = nextState ? 'like' : 'unlike';
      const r = await fetch(`/api/themes/${encodeURIComponent(themeId)}/${endpoint}`, {
        method: 'POST',
      });
      if (!r.ok) throw new Error(`like_toggle_failed:${r.status}`);
      let updated = false;
      try {
        const j = await r.json();
        updated = Boolean(j?.updated);
      } catch {}
      setItems((prev) => prev.map((t) => {
        if (t.themeId !== themeId) return t;
        const currentLikes = typeof t.likes === 'number' ? t.likes : 0;
        const nextLikes = updated
          ? Math.max(0, currentLikes + (nextState ? 1 : -1))
          : currentLikes;
        return { ...t, liked: nextState, likes: nextLikes };
      }));
    } catch (e: any) {
      setError(e?.message ? `いいね状態の更新に失敗しました (${e.message})` : 'いいね状態の更新に失敗しました');
    }
  };

  const handleLikedKey = (event: KeyboardEvent<HTMLSpanElement>, themeId: string, liked: boolean | undefined) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleLiked(themeId, liked);
    }
  };

  const handleClearedKey = (event: KeyboardEvent<HTMLSpanElement>, themeId: string, cleared: boolean | undefined) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggleCleared(themeId, cleared);
    }
  };

  return (
    <main className="min-h-screen bg-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex justify-center">
          <button
            onClick={startGame}
            disabled={!selectedTheme || starting}
            className="px-10 py-3 text-lg font-semibold rounded-full bg-purple-600 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow"
          >
            {starting ? '開始中…' : 'このテーマで開始'}
          </button>
        </div>
        {error && (
          <div className="text-center text-sm text-red-600">{error}</div>
        )}
        <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="bg-white border rounded-lg p-4 space-y-4">
            <h2 className="text-lg font-semibold">対戦キャラクターを選択</h2>
            <div className="space-y-3">
              {CHARACTER_OPTIONS.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedChar(c.id)}
                  className={`w-full text-left border rounded px-3 py-2 transition ${selectedChar === c.id ? 'border-purple-500 bg-purple-50' : 'border-slate-200 hover:bg-slate-50'}`}
                >
                  <div className="font-medium">{c.label}</div>
                  <div className="text-xs text-slate-500">ID: {c.id}</div>
                </button>
              ))}
            </div>
            {charImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={charImage} alt={charConfig?.display_name || selectedChar} className="w-full rounded border" />
            )}
            <div className="text-xs text-slate-500">
              {charConfig?.display_name || selectedChar}
            </div>
          </aside>
          <section className="bg-white border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4 gap-3">
              <h2 className="text-lg font-semibold">テーマを選択</h2>
              <button
                onClick={() => setHideCleared((prev) => !prev)}
                className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition ${hideCleared ? 'border-purple-500 bg-purple-50 text-purple-700' : 'border-slate-200 hover:bg-slate-50 text-slate-600'}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/crear.png"
                  alt="クリア済みアイコン"
                  className="h-4 w-4"
                />
                <span>{hideCleared ? 'クリア済みを表示' : 'クリア済みを隠す'}</span>
              </button>
            </div>
            {hideCleared && items.filter((t) => !t.cleared).length === 0 ? (
              <div className="text-sm text-slate-500 border rounded px-3 py-6 text-center">
                クリア済みでないテーマはありません。
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.filter((t) => !hideCleared || !t.cleared).map((t) => {
                  const selected = selectedTheme === t.themeId;
                  return (
                    <button
                      key={t.themeId}
                      onClick={() => setSelectedTheme(t.themeId)}
                    className={`text-left border rounded-lg p-4 transition h-full ${selected ? 'border-purple-500 bg-purple-50 shadow-sm' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="text-sm font-semibold mb-1">{t.title}</div>
                    <div className="text-xs text-slate-500 h-12 overflow-hidden">
                      {t.snippet ?? t.question ?? ''}
                    </div>
                    <div className="mt-3 text-[11px] text-slate-400 flex items-center gap-4">
                      <span
                        role="button"
                        tabIndex={0}
                        className="inline-flex h-6 w-6 items-center justify-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLiked(t.themeId, t.liked);
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          handleLikedKey(event, t.themeId, t.liked);
                        }}
                        aria-pressed={Boolean(t.liked)}
                        aria-label={t.liked ? 'いいねを解除' : 'いいねする'}
                        title={t.liked ? 'いいね解除' : 'いいね'}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={t.liked ? '/good.png' : '/nogood.png'}
                          alt={t.liked ? 'いいね済み' : '未いいね'}
                          className="h-6 w-6"
                        />
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        className="inline-flex h-6 w-6 items-center justify-center"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleCleared(t.themeId, t.cleared);
                        }}
                        onKeyDown={(event) => {
                          event.stopPropagation();
                          handleClearedKey(event, t.themeId, t.cleared);
                        }}
                        aria-pressed={Boolean(t.cleared)}
                        aria-label={t.cleared ? 'クリア済みを解除' : 'クリアとして記録'}
                        title={t.cleared ? 'クリア済み' : '未クリア'}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={t.cleared ? '/crear.png' : '/nocrear.png'}
                          alt={t.cleared ? 'クリア済み' : '未クリア'}
                          className="h-6 w-6"
                        />
                      </span>
                    </div>
                  </button>
                );
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}

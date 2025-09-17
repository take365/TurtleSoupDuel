"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getApiBase } from '@/lib/api';

type ThemeItem = {
  themeId: string;
  title: string;
  snippet?: string;
  likes?: number;
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
            <h2 className="text-lg font-semibold mb-4">テーマを選択</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {themes.map((t) => {
                const selected = selectedTheme === t.themeId;
                return (
                  <button
                    key={t.themeId}
                    onClick={() => setSelectedTheme(t.themeId)}
                    className={`text-left border rounded-lg p-4 transition h-full ${selected ? 'border-purple-500 bg-purple-50 shadow-sm' : 'border-slate-200 hover:bg-slate-50'}`}
                  >
                    <div className="text-sm font-semibold mb-1">{t.title}</div>
                    <div className="text-xs text-slate-500 h-12 overflow-hidden">{t.snippet}</div>
                    <div className="mt-3 text-[11px] text-slate-400 flex gap-3">
                      <span>likes: {t.likes ?? '-'}</span>
                      <span>cleared: {t.cleared ? 'Yes' : 'No'}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

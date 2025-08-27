"use client";
import { useState } from 'react';

export default function SubmitThemePage() {
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [solution, setSolution] = useState('');
  const [id, setId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>('draft');
  const [msg, setMsg] = useState<string>('');

  const payload = { title, question, solution };

  const createOrUpdate = async () => {
    setMsg('');
    const res = await fetch('/api/user-themes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(id ? { action: 'update', id, payload } : { action: 'create', payload })
    });
    try {
      const j = await res.json();
      if (!res.ok) throw new Error(j?.message || 'failed');
      if (!id) setId(j.id);
      setStatus(j.status || status);
      setMsg('保存しました');
    } catch (e: any) { setMsg('保存に失敗: ' + e.message); }
  };

  const submit = async () => {
    if (!id) { setMsg('まず保存してください'); return; }
    const res = await fetch('/api/user-themes', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'submit', id })
    });
    try { const j = await res.json(); if (!res.ok) throw new Error(j?.message || 'failed'); setStatus('submitted'); setMsg('申請しました'); } catch (e: any) { setMsg('申請に失敗: ' + e.message); }
  };

  return (
    <main className="min-h-screen p-8 max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-bold">テーマ投稿</h1>
      <div className="text-sm text-gray-600">ステータス: {status}{id && ` / ID: ${id}`}</div>
      <input className="w-full border rounded px-3 py-2" placeholder="タイトル" value={title} onChange={(e) => setTitle(e.target.value)} />
      <textarea className="w-full border rounded px-3 py-2" placeholder="問題文" rows={4} value={question} onChange={(e) => setQuestion(e.target.value)} />
      <textarea className="w-full border rounded px-3 py-2" placeholder="解説（正解）" rows={6} value={solution} onChange={(e) => setSolution(e.target.value)} />
      <div className="flex gap-3">
        <button onClick={createOrUpdate} className="border rounded px-3 py-2">下書きを保存</button>
        <button onClick={submit} className="border rounded px-3 py-2" disabled={!id}>申請する</button>
      </div>
      {msg && <div className="text-sm text-gray-700">{msg}</div>}
    </main>
  );
}


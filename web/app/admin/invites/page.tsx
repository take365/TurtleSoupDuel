"use client";
import { useState } from 'react';

export default function AdminInvitesPage() {
  const [code, setCode] = useState('TEST-' + Math.random().toString(36).slice(2, 6).toUpperCase());
  const [maxUses, setMaxUses] = useState(5);
  const [expiresAt, setExpiresAt] = useState<string>('');
  const [msg, setMsg] = useState('');

  const submit = async () => {
    setMsg('');
    const r = await fetch('/api/admin/invites', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, maxUses, expiresAt: expiresAt || null }) });
    try { const j = await r.json(); if (!r.ok) throw new Error(j?.message || 'failed'); setMsg('発行しました'); } catch (e: any) { setMsg('失敗: ' + e.message); }
  };

  return (
    <main className="min-h-screen p-8 max-w-xl mx-auto space-y-3">
      <h1 className="text-2xl font-bold">/admin/invites</h1>
      <input className="w-full border rounded px-3 py-2" placeholder="招待コード" value={code} onChange={(e) => setCode(e.target.value)} />
      <input className="w-full border rounded px-3 py-2" placeholder="最大使用回数" type="number" value={maxUses} onChange={(e) => setMaxUses(parseInt(e.target.value || '0', 10))} />
      <input className="w-full border rounded px-3 py-2" placeholder="期限 (YYYY-MM-DD or 空)" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
      <button onClick={submit} className="border rounded px-3 py-2">発行</button>
      {msg && <div className="text-sm text-gray-700">{msg}</div>}
      <p className="text-sm text-gray-600">管理者のみ。権限が無い場合は403になります。</p>
    </main>
  );
}


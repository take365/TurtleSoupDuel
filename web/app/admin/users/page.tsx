"use client";
import { useState } from 'react';

export default function AdminUsersPage() {
  const [handle, setHandle] = useState('');
  const [msg, setMsg] = useState('');

  const act = async (action: 'freeze' | 'unfreeze') => {
    setMsg('');
    const r = await fetch('/api/admin/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle, action }) });
    try { const j = await r.json(); if (!r.ok) throw new Error(j?.message || 'failed'); setMsg(`${action} 完了`); } catch (e: any) { setMsg('失敗: ' + e.message); }
  };

  return (
    <main className="min-h-screen p-8 max-w-xl mx-auto space-y-3">
      <h1 className="text-2xl font-bold">/admin/users</h1>
      <input className="w-full border rounded px-3 py-2" placeholder="handle" value={handle} onChange={(e) => setHandle(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={() => act('freeze')} className="border rounded px-3 py-2">凍結</button>
        <button onClick={() => act('unfreeze')} className="border rounded px-3 py-2">解除</button>
      </div>
      {msg && <div className="text-sm text-gray-700">{msg}</div>}
      <p className="text-sm text-gray-600">管理者のみ。権限が無い場合は403になります。</p>
    </main>
  );
}


"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle, password }),
      });
      if (!res.ok) {
        let msg = "login_failed";
        try { const j = await res.json(); msg = `${j.code || res.status}`; } catch {}
        setError(msg);
      } else {
        router.push("/themes");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <h1 className="text-xl font-bold">ログイン</h1>
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="handle"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 text-white rounded px-3 py-2 disabled:opacity-50"
        >
          {loading ? "処理中..." : "ログイン"}
        </button>
        <p className="text-sm">
          招待コードがある方は <a className="underline" href="/signup">サインアップ</a>
        </p>
      </form>
    </main>
  );
}

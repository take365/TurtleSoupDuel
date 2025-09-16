"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function SignupPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [code, setCode] = useState("");
  const [handle, setHandle] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const c = sp.get("code");
    if (c) setCode(c);
  }, [sp]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, handle, password }),
      });
      if (!res.ok) {
        let msg = "signup_failed";
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
        <h1 className="text-xl font-bold">サインアップ</h1>
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="invite code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="handle (a-zA-Z0-9_)"
          value={handle}
          onChange={(e) => setHandle(e.target.value)}
        />
        <input
          className="w-full border rounded px-3 py-2"
          placeholder="password (>=8)"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-red-600 text-sm">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-green-600 text-white rounded px-3 py-2 disabled:opacity-50"
        >
          {loading ? "処理中..." : "サインアップ"}
        </button>
        <p className="text-sm">
          既にアカウントがある方は <a className="underline" href="/login">ログイン</a>
        </p>
      </form>
    </main>
  );
}

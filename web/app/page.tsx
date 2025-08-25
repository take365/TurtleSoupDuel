export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">TurtleSoupDuel Frontend</h1>
        <p className="text-gray-600">ブラウザで最小フローを確認できます。</p>
        <div className="space-x-4">
          <a className="underline text-blue-600" href="/login">/login</a>
          <a className="underline text-blue-600" href="/signup">/signup</a>
          <a className="underline text-blue-600" href="/me">/me</a>
        </div>
        <p className="text-sm text-gray-500">
          Health: <a className="underline" href="/api/health">/api/health</a>
        </p>
      </div>
    </main>
  );
}

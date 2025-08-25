export default function HomePage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">TurtleSoupDuel Frontend</h1>
        <p className="text-gray-600">Next.js App Router scaffold is ready.</p>
        <p className="text-sm text-gray-500">
          Health check: <a className="underline" href="/api/health">/api/health</a>
        </p>
      </div>
    </main>
  );
}


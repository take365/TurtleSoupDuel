import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TurtleSoupDuel',
  description: 'Next.js frontend for TurtleSoupDuel',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}


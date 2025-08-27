/* Seed a few sample themes for listing */
const { getClient } = require('./_common');

const samples = [
  { id: 'sample-1', title: 'サンプル1: なくした鍵', snippet: '鍵はどこへ？' },
  { id: 'sample-2', title: 'サンプル2: 壊れた時計', snippet: '進まない針の理由' },
  { id: 'sample-3', title: 'サンプル3: 見えない来客', snippet: '玄関のチャイム' },
];

async function main() {
  const client = getClient();
  await client.connect();
  for (const t of samples) {
    await client.execute(
      'INSERT INTO themes_by_id (theme_id, title, snippet) VALUES (?, ?, ?)',
      [t.id, t.title, t.snippet], { prepare: true }
    );
  }
  console.log(`Seeded ${samples.length} themes`);
  await client.shutdown();
}

main().catch((e) => { console.error(e); process.exit(1); });


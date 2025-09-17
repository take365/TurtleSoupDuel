/* Import FastAPI theme JSON into Cassandra themes_by_id */
const fs = require('fs');
const path = require('path');
const { getClient } = require('./_common');

const THEMES_DIR = path.resolve(__dirname, '..', '..', 'themes');

function listJsonFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(dir, f));
  } catch (err) {
    console.error('[import] Failed to read themes directory', err?.message || err);
    return [];
  }
}

function loadTheme(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[import] skip ${file}:`, err?.message || err);
    return null;
  }
}

async function ensureColumns(client) {
  const statements = [
    "ALTER TABLE themes_by_id ADD question text",
    "ALTER TABLE themes_by_id ADD solution text",
    "ALTER TABLE themes_by_id ADD facts list<text>",
    "ALTER TABLE themes_by_id ADD tags list<text>",
    "ALTER TABLE themes_by_id ADD lang text"
  ];
  for (const stmt of statements) {
    try {
      await client.execute(stmt);
      console.log('[import] applied:', stmt);
    } catch (err) {
      const msg = String(err?.message || err || '');
      if (!/Invalid column name/i.test(msg) && !/Existing keyspace/i.test(msg)) {
        console.warn('[import] warning executing', stmt, '-', msg);
      }
    }
  }
}

function buildSnippet(question) {
  const text = String(question || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= 60) return text;
  return text.slice(0, 57) + '…';
}

async function main() {
  const files = listJsonFiles(THEMES_DIR);
  if (!files.length) {
    console.error('[import] No JSON files under', THEMES_DIR);
    process.exit(1);
  }

  const client = getClient();
  await client.connect();
  await ensureColumns(client);

  let count = 0;
  for (const file of files) {
    const data = loadTheme(file);
    if (!data) continue;
    const themeId = data.id;
    if (!themeId) continue;
    const values = [
      themeId,
      data.title || '',
      buildSnippet(data.question),
      data.question || '',
      data.solution || '',
      Array.isArray(data.facts) ? data.facts : [],
      Array.isArray(data.tags) ? data.tags : [],
      data.lang || null,
    ];
    try {
      await client.execute(
        'INSERT INTO themes_by_id (theme_id, title, snippet, question, solution, facts, tags, lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        values,
        { prepare: true }
      );
      count += 1;
    } catch (err) {
      console.error('[import] failed to insert', themeId, err?.message || err);
    }
  }

  console.log(`[import] upserted ${count} themes`);
  await client.shutdown();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


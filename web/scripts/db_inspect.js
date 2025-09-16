/* Quick DB inspection for local/dev */
const { getClient } = require('./_common');

async function q(client, cql, params = []) {
  const r = await client.execute(cql, params, { prepare: true });
  return r;
}

function showRows(title, rows, mapFn) {
  console.log(`\n=== ${title} (up to 10) ===`);
  const list = rows.slice(0, 10);
  if (!list.length) { console.log('(empty)'); return; }
  for (const row of list) {
    try { console.log(' -', mapFn(row)); }
    catch { console.log(' -', row); }
  }
}

async function main() {
  const client = getClient();
  await client.connect();

  // Core tables
  const tables = [
    'users_by_id',
    'handle_to_user',
    'sessions_by_id',
    'user_flags_by_id',
    'invites_by_code',
    'invite_slots',
    'usage_total_by_user',
    'usage_by_user_date',
    'themes_by_id',
    'clears_by_user',
    'likes_by_user',
    'likes_by_theme',
    'theme_like_counts',
    'characters_by_id',
    'affinity_by_user',
    'user_themes',
  ];
  console.log('Inspecting tables in keyspace:', process.env.CASSANDRA_KEYSPACE || 'turtlesoup');
  for (const t of tables) {
    try {
      const r = await q(client, `SELECT * FROM ${t} LIMIT 10`);
      console.log(`\nTable ${t}: rowLength=${r.rowLength}`);
      // Rough sample formatting
      if (t === 'invites_by_code') {
        showRows(t, r.rows, (row) => ({ code: row.get('code'), max_uses: row.get('max_uses'), expires_at: row.get('expires_at') }));
      } else if (t === 'invite_slots') {
        showRows(t, r.rows, (row) => ({ code: row.get('code'), slot: row.get('slot'), claimed_by: row.get('claimed_by') }));
      } else if (t === 'users_by_id') {
        showRows(t, r.rows, (row) => ({ user_id: row.get('user_id'), handle: row.get('handle'), role: row.get('role') }));
      } else if (t === 'handle_to_user') {
        showRows(t, r.rows, (row) => ({ handle: row.get('handle'), user_id: row.get('user_id') }));
      } else if (t === 'themes_by_id') {
        showRows(t, r.rows, (row) => ({ theme_id: row.get('theme_id'), title: row.get('title') }));
      } else if (t === 'affinity_by_user') {
        showRows(t, r.rows, (row) => ({ user_id: row.get('user_id'), character_id: row.get('character_id'), score: row.get('score') }));
      } else {
        showRows(t, r.rows, (row) => row);
      }
    } catch (e) {
      console.warn(`Table ${t}: error:`, e.message);
    }
  }

  await client.shutdown();
}

main().catch((e) => { console.error(e); process.exit(1); });

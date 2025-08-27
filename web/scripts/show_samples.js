/* Show a few rows from key tables for quick verification */
const { getClient } = require('./_common');

async function main() {
  const client = getClient();
  await client.connect();

  // Invites
  const invites = await client.execute('SELECT code, max_uses, expires_at FROM invites_by_code LIMIT 5');
  console.log('invites_by_code (up to 5):');
  for (const row of invites.rows || []) {
    console.log('  -', row.code || row.get('code'), {
      max_uses: row.max_uses ?? row.get?.('max_uses'),
      expires_at: row.expires_at ?? row.get?.('expires_at'),
    });
  }

  // Invite slots count for a given code (if any invite exists)
  if ((invites.rows || []).length) {
    const code = invites.rows[0].code || invites.rows[0].get('code');
    const r1 = await client.execute('SELECT count(*) FROM invite_slots WHERE code=?', [code], { prepare: true });
    const total = r1.first()['count'] || r1.first().get('count');
    // Claimed slots: fetch rows in the partition and count on client side（IS NOT NULL フィルタは未対応環境があるため）
    const rRows = await client.execute('SELECT slot, claimed_by FROM invite_slots WHERE code=?', [code], { prepare: true });
    let claimed = 0;
    for (const row of rRows.rows || []) {
      const val = row.claimed_by ?? (row.get ? row.get('claimed_by') : undefined);
      if (val != null) claimed++;
    }
    console.log(`invite_slots for '${code}': total=${total} claimed=${claimed}`);
  }

  // Themes
  const themes = await client.execute('SELECT theme_id, title, snippet FROM themes_by_id LIMIT 5');
  console.log('themes_by_id (up to 5):');
  for (const row of themes.rows || []) {
    console.log('  -', row.theme_id || row.get('theme_id'), row.title || row.get('title'));
  }

  await client.shutdown();
}

main().catch((e) => { console.error(e); process.exit(1); });

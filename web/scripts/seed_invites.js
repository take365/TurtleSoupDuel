/* Seed invites and slots for local/dev usage */
const { getClient } = require('./_common');

async function main() {
  const client = getClient();
  await client.connect();
  const code = process.env.SEED_INVITE_CODE || 'dev-2025';
  const maxUses = Number(process.env.SEED_INVITE_USES || 10);
  const expiresAt = null; // dev: no expiry

  await client.execute(
    'INSERT INTO invites_by_code (code, max_uses, expires_at, issued_by, created_at) VALUES (?, ?, ?, ?, ?)',
    [code, maxUses, expiresAt, 'seed', new Date()], { prepare: true }
  );

  for (let slot = 0; slot < maxUses; slot++) {
    await client.execute(
      'INSERT INTO invite_slots (code, slot, claimed_by, claimed_at) VALUES (?, ?, ?, ?) IF NOT EXISTS',
      [code, slot, null, null], { prepare: true }
    );
  }

  console.log(`Seeded invite '${code}' with ${maxUses} slots`);
  await client.shutdown();
}

main().catch((e) => { console.error(e); process.exit(1); });


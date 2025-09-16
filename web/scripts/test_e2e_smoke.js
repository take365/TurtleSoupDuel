/* E2E smoke: invite -> signup -> login -> character fetch -> 1-turn game via FastAPI -> affinity update */
/* Usage:
 *   node web/scripts/test_e2e_smoke.js
 * ENV:
 *   E2E_NEXT_BASE=http://localhost:3000
 *   E2E_FASTAPI_BASE=http://localhost:8000/api/v1
 *   E2E_HANDLE=e2e_user
 *   E2E_PASSWORD=changeme123
 *   E2E_AI_MODEL=gpt-4o-mini
 */

const { getClient } = require('./_common');

const NEXT = process.env.E2E_NEXT_BASE || 'http://localhost:3000';
const API = process.env.E2E_FASTAPI_BASE || 'http://localhost:8000/api/v1';

function nowCode() {
  const s = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `e2e-${s}-${Math.floor(Math.random()*1000)}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class Jar {
  constructor() { this.map = new Map(); }
  eat(setCookie) {
    if (!setCookie) return;
    const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
    for (const sc of arr) {
      const m = String(sc).match(/^\s*([^=;\s]+)=([^;\s]*)(?:;|$)/);
      if (m) this.map.set(m[1], m[2]);
    }
  }
  header() {
    if (!this.map.size) return '';
    const parts = [];
    for (const [k, v] of this.map.entries()) parts.push(`${k}=${v}`);
    return parts.join('; ');
  }
}

async function http(method, url, { json, jar, headers } = {}) {
  const init = { method, headers: { ...(headers||{}) } };
  if (jar) {
    const c = jar.header(); if (c) init.headers['cookie'] = c;
  }
  if (json !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(json);
  }
  const res = await fetch(url, init);
  const text = await res.text();
  const setc = res.headers.get('set-cookie');
  if (jar && setc) jar.eat(setc);
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, ok: res.ok, headers: res.headers, body };
}

async function ensureInvite(client, code, maxUses = 5) {
  await client.execute(
    'INSERT INTO invites_by_code (code, max_uses, expires_at, issued_by, created_at) VALUES (?, ?, ?, ?, ?)',
    [code, maxUses, null, 'e2e', new Date()], { prepare: true }
  );
  for (let slot = 0; slot < maxUses; slot++) {
    await client.execute(
      'INSERT INTO invite_slots (code, slot, claimed_by, claimed_at) VALUES (?, ?, ?, ?) IF NOT EXISTS',
      [code, slot, null, null], { prepare: true }
    );
  }
}

async function main() {
  const handle = process.env.E2E_HANDLE || `user_${Math.floor(Math.random()*1e6)}`;
  const password = process.env.E2E_PASSWORD || 'changeMe123!';
  const aiModel = process.env.E2E_AI_MODEL || 'gpt-4o-mini';
  const jar = new Jar();

  // 1) ensure invite in DB
  const code = nowCode();
  const client = getClient();
  await client.connect();
  await ensureInvite(client, code, 5);
  console.log('[invite] code=', code);

  // 2) signup (sets sid cookie)
  const r1 = await http('POST', `${NEXT}/api/auth/signup`, { json: { code, handle, password }, jar });
  if (!r1.ok) { console.error('signup failed', r1.status, r1.body); process.exit(1); }
  console.log('[signup] ok sessionId=', r1.body.sessionId);

  // 3) me
  const r2 = await http('GET', `${NEXT}/api/auth/me`, { jar });
  if (!r2.ok) { console.error('me failed', r2.status, r2.body); process.exit(1); }
  console.log('[me]', r2.body);

  // 4) fetch character (static)
  const r3 = await http('GET', `${NEXT}/characters/ja_butler/prompts.json`);
  if (!r3.ok) { console.error('char fetch failed', r3.status); process.exit(1); }
  console.log('[character] ja_butler keys=', Object.keys(r3.body || {}).length);

  // 5) themes
  const r4 = await http('GET', `${API}/themes`);
  if (!r4.ok || !Array.isArray(r4.body) || r4.body.length === 0) {
    console.error('themes failed', r4.status, r4.body); process.exit(1);
  }
  const themeId = (r4.body.find((t) => t.id === 'turtle-0001') || r4.body[0]).id;
  console.log('[themes] picked', themeId);

  // 6) start game
  const r5 = await http('POST', `${API}/game/start`, { json: { theme_id: themeId, ai_model: aiModel } });
  if (!r5.ok) { console.error('start failed', r5.status, r5.body); process.exit(1); }
  console.log('[start] ok');

  // 7) user question
  const r6 = await http('POST', `${API}/game/user/question`, { json: { text: '場所は重要ですか？' } });
  if (!r6.ok) { console.error('user/question failed', r6.status, r6.body); process.exit(1); }
  console.log('[user/question]', r6.body);

  // 8) ai question
  const r7 = await http('POST', `${API}/game/ai/question`);
  if (!r7.ok) { console.error('ai/question failed', r7.status, r7.body); process.exit(1); }
  console.log('[ai/question]', r7.body.text);

  // 9) ai guess
  const r8 = await http('POST', `${API}/game/ai/guess`);
  if (!r8.ok) { console.error('ai/guess failed', r8.status, r8.body); process.exit(1); }
  console.log('[ai/guess]', r8.body.result);

  // 10) next
  const r9 = await http('POST', `${API}/game/next`);
  if (!r9.ok) { console.error('next failed', r9.status, r9.body); process.exit(1); }
  console.log('[next]', r9.body.phase, r9.body.current_turn);

  // 11) state
  const r10 = await http('GET', `${API}/game/state`);
  if (!r10.ok) { console.error('state failed', r10.status, r10.body); process.exit(1); }
  console.log('[state]', { turn: r10.body.turn, phase: r10.body.phase });

  // 12) affinity +5 for selected char
  const r11 = await http('POST', `${NEXT}/api/characters/${encodeURIComponent('ja_butler')}/affinity`, { json: { delta: 5 }, jar });
  if (!r11.ok) { console.error('affinity failed', r11.status, r11.body); process.exit(1); }
  console.log('[affinity] score=', r11.body.score);

  await client.shutdown();
  console.log('\nE2E smoke OK');
}

main().catch((e) => { console.error(e); process.exit(1); });


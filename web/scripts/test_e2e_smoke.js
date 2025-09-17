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

async function httpOrDie(method, url, opts) {
  try {
    return await http(method, url, opts);
  } catch (err) {
    console.error(`[network] ${method} ${url} failed:`, err.message || err);
    if (url.startsWith(API)) {
      console.error('Hint: FastAPI is unavailable. Start it via `uvicorn app.main:app --reload --port 8000`.');
    } else if (url.startsWith(NEXT)) {
      console.error('Hint: Next.js dev server is unavailable. Start it via `npm run dev` in web/.');
    }
    process.exit(1);
  }
}

async function canReach(url) {
  try {
    await fetch(url, { method: 'HEAD' });
    return true;
  } catch {
    return false;
  }
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
  const skipEnv = String(process.env.E2E_SKIP_NEXT || '').toLowerCase();
  let skipNext = skipEnv === '1' || skipEnv === 'true';
  let client = null;
  let clientConnected = false;

  if (!skipNext) {
    try {
      client = getClient();
      await client.connect();
      clientConnected = true;
    } catch (err) {
      console.warn('[warn] Cassandra unreachable – skipping Next.js API flow:', err.message || err);
      if (client) {
        try { await client.shutdown(); } catch {}
      }
      client = null;
      skipNext = true;
    }
    if (!skipNext && clientConnected) {
      const nextReachable = await canReach(NEXT);
      if (!nextReachable) {
        console.warn('[warn] Next.js dev server unreachable – skipping Next.js API flow');
        try { await client.shutdown(); } catch {}
        client = null;
        clientConnected = false;
        skipNext = true;
      }
    }
  }

  if (!skipNext && clientConnected) {
    // 1) ensure invite in DB
    const code = nowCode();
    await ensureInvite(client, code, 5);
    console.log('[invite] code=', code);

    // 2) signup (sets sid cookie)
    const r1 = await httpOrDie('POST', `${NEXT}/api/auth/signup`, { json: { code, handle, password }, jar });
    if (!r1.ok) { console.error('signup failed', r1.status, r1.body); process.exit(1); }
    console.log('[signup] ok sessionId=', r1.body.sessionId);

    // 3) me
    const r2 = await httpOrDie('GET', `${NEXT}/api/auth/me`, { jar });
    if (!r2.ok) { console.error('me failed', r2.status, r2.body); process.exit(1); }
    console.log('[me]', r2.body);

    // 4) fetch character (static)
    const r3 = await httpOrDie('GET', `${NEXT}/characters/ja_butler/prompts.json`);
    if (!r3.ok) { console.error('char fetch failed', r3.status); process.exit(1); }
    console.log('[character] ja_butler keys=', Object.keys(r3.body || {}).length);
  } else {
    console.log('[skip] Skipping Next.js signup / character fetch (set E2E_SKIP_NEXT=false and ensure Cassandra is reachable to enable)');
  }

  // 5) themes
  const r4 = await httpOrDie('GET', `${API}/themes`);
  if (!r4.ok || !Array.isArray(r4.body) || r4.body.length === 0) {
    console.error('themes failed', r4.status, r4.body); process.exit(1);
  }
  const themeId = (r4.body.find((t) => t.id === 'turtle-0001') || r4.body[0]).id;
  console.log('[themes] picked', themeId);

  // 6) start game
  const r5 = await httpOrDie('POST', `${API}/game/start`, { json: { theme_id: themeId, ai_model: aiModel } });
  if (!r5.ok) { console.error('start failed', r5.status, r5.body); process.exit(1); }
  console.log('[start] ok');

  // 7) user question
  const r6 = await httpOrDie('POST', `${API}/game/user/question`, { json: { text: '場所は重要ですか？' } });
  if (!r6.ok) { console.error('user/question failed', r6.status, r6.body); process.exit(1); }
  console.log('[user/question]', r6.body);

  // 8) user guess (pass to advance AI turn)
  const r7 = await httpOrDie('POST', `${API}/game/user/guess`, { json: { pass: true } });
  if (!r7.ok) { console.error('user/guess failed', r7.status, r7.body); process.exit(1); }
  console.log('[user/guess]', r7.body);

  // 9) ai question
  const r8 = await httpOrDie('POST', `${API}/game/ai/question`);
  if (!r8.ok) { console.error('ai/question failed', r8.status, r8.body); process.exit(1); }
  console.log('[ai/question]', r8.body.text);

  // 10) ai guess
  const r9 = await httpOrDie('POST', `${API}/game/ai/guess`);
  if (!r9.ok) { console.error('ai/guess failed', r9.status, r9.body); process.exit(1); }
  console.log('[ai/guess]', r9.body.result);

  // 11) next
  const r10 = await httpOrDie('POST', `${API}/game/next`);
  if (!r10.ok) { console.error('next failed', r10.status, r10.body); process.exit(1); }
  console.log('[next]', r10.body.phase, r10.body.current_turn);

  // 12) state
  const r11 = await httpOrDie('GET', `${API}/game/state`);
  if (!r11.ok) { console.error('state failed', r11.status, r11.body); process.exit(1); }
  console.log('[state]', { turn: r11.body.turn, phase: r11.body.phase });

  // 13) affinity +5 for selected char
  if (!skipNext && clientConnected) {
    const r12 = await httpOrDie('POST', `${NEXT}/api/characters/${encodeURIComponent('ja_butler')}/affinity`, { json: { delta: 5 }, jar });
    if (!r12.ok) { console.error('affinity failed', r12.status, r12.body); process.exit(1); }
    console.log('[affinity] score=', r12.body.score);
  } else {
    console.log('[skip] Skipping affinity API call');
  }

  if (clientConnected && client) {
    await client.shutdown();
  }
  console.log('\nE2E smoke OK');
}

main().catch((e) => { console.error(e); process.exit(1); });

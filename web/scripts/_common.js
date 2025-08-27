const fs = require('fs');
const path = require('path');
const { Client } = require('cassandra-driver');

function loadEnvLocal() {
  // 可能なら .env.local を読み、未設定の環境変数だけ補完
  try {
    const p = path.join(__dirname, '..', '.env.local');
    const txt = fs.readFileSync(p, 'utf8');
    for (const line of txt.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const k = m[1];
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      if (v.startsWith("'") && v.endsWith("'")) v = v.slice(1, -1);
      if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
    }
  } catch {}
}

function parseContactPoints(s) {
  const def = '127.0.0.1:9042';
  const raw = (s || def).split(',').map(x => x.trim()).filter(Boolean);
  let port = 9042;
  const hosts = raw.map((h) => {
    const m = h.match(/^(.*?):(\d+)$/);
    if (m) { port = Number(m[2]); return m[1]; }
    return h;
  });
  return { hosts, port };
}

function getClient() {
  loadEnvLocal();
  const { hosts, port } = parseContactPoints(process.env.CASSANDRA_CONTACT_POINTS);
  return new Client({
    contactPoints: hosts,
    localDataCenter: process.env.CASSANDRA_DC || 'dc1',
    keyspace: process.env.CASSANDRA_KEYSPACE || 'turtlesoup',
    credentials: (process.env.CASSANDRA_USER && process.env.CASSANDRA_PASS)
      ? { username: process.env.CASSANDRA_USER, password: process.env.CASSANDRA_PASS }
      : undefined,
    protocolOptions: { port },
  });
}

module.exports = { getClient };


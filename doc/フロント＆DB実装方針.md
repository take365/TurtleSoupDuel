# TurtleSoupDuel フロント＆DB実装方針（Next.js × さくら NoSQL β）

**想定規模**：ユーザ最大100、同時接続<10。**優先方針**：無料の *NoSQL β（Cassandra）* を主DBとして運用。Next.js（App Router）をフロント兼API窓口に、既存FastAPIは“ゲーム進行BFF”として併用可。

---

## 目次

1. [全体アーキテクチャと運用前提](#全体アーキテクチャと運用前提)
2. [Cassandra データモデル（主要CQL）](#cassandra-データモデル主要cql)
3. [Next.js 実装要点（Route Handlers/SSE/認証/レート制御）](#nextjs-実装要点route-handlerssses認証レート制御)
4. [ロードマップ & Codex CLI 依頼テンプレ](#ロードマップ--codex-cli-依頼テンプレ)

---

## 全体アーキテクチャと運用前提

* **フロント/SSR**：Next.js（App Router）。UIは Tailwind + shadcn/ui。データ取得は Server Components + Route Handlers。
* **API/進行エンジン**：既存 FastAPI サービス（別コンテナ）を **BFF** 的に利用可（SSE/REST）。
* **DB**：さくら **NoSQL β（Cassandra）** を“単独”で採用。ジョイン不可のため **クエリ先行設計＋反転テーブル＋二重書き込み** を基本原則に。
* **整合性**：必要箇所のみ **LWT（IF 条件の軽量トランザクション）** を使用（例：ハンドルの一意確保、クリア重複防止、招待スロット確保）。
* **カウンタ**：日次/合計のAPI使用量は **counter** テーブルで原子的加算。
* **セッション**：TTLで自動失効（httpOnly Cookieにセッショントークン、DBのブラックリスト不要）。
* **ゾーン/ネットワーク**：NoSQL β は tk1b 想定。AppRun も同一ゾーン/スイッチで接続。

> ねらい：RDB で楽になる箇所もあるが、規模/要件的に Cassandra 単独でも十分に成立。βへの協力（国産支援）という目的にも合致。

---

## Cassandra データモデル（主要CQL）

**方針**：画面ごとの読み取りに最適化したテーブルを用意。下記は“最小限の核”。

```sql
/* ユーザ/認証 */
create table if not exists users_by_id (
  user_id    text primary key,
  handle     text,
  pw_hash    text,
  role       text,            -- 'user' | 'admin'
  created_at timestamp
);
-- ハンドル一意性（LWTで予約）
create table if not exists handle_to_user (
  handle     text primary key,
  user_id    text
);
-- セッション（TTL失効）
create table if not exists sessions_by_id (
  session_id text primary key,
  user_id    text,
  user_agent text,
  expires_at timestamp
) WITH default_time_to_live = 1209600; -- 14日

/* 招待コード（x回/期間） */
create table if not exists invites_by_code (
  code       text primary key,
  max_uses   int,
  expires_at timestamp,
  issued_by  text,
  created_at timestamp
);
-- “使用スロット”を事前に max_uses 行作成し、LWTで奪取
create table if not exists invite_slots (
  code       text,
  slot       int,
  claimed_by text,
  claimed_at timestamp,
  primary key ((code), slot)
);

/* 使用量カウンタ（合計/日次） */
create table if not exists usage_total_by_user (
  user_id        text primary key,
  calls          counter,
  prompt_tokens  counter,
  output_tokens  counter
);
create table if not exists usage_by_user_date (
  user_id        text,
  yyyymmdd       text,
  calls          counter,
  prompt_tokens  counter,
  output_tokens  counter,
  primary key ((user_id), yyyymmdd)
);

/* テーマ/進捗/いいね */
create table if not exists themes_by_id (
  theme_id   text primary key,
  title      text,
  snippet    text
);
create table if not exists clears_by_user (
  user_id    text,
  theme_id   text,
  cleared_at timestamp,
  primary key ((user_id), theme_id)
);
create table if not exists likes_by_user (
  user_id    text,
  theme_id   text,
  liked_at   timestamp,
  primary key ((user_id), theme_id)
);
create table if not exists likes_by_theme (
  theme_id   text,
  user_id    text,
  liked_at   timestamp,
  primary key ((theme_id), user_id)
);
create table if not exists theme_like_counts (
  theme_id   text primary key,
  likes      counter
);

/* キャラ/好感度 */
create table if not exists characters_by_id (
  character_id text primary key,
  name         text,
  config_json  text
);
create table if not exists affinity_by_user (
  user_id      text,
  character_id text,
  score        int,
  updated_at   timestamp,
  primary key ((user_id), character_id)
);

/* ユーザ投稿テーマ（モデレーション） */
create table if not exists user_themes (
  user_theme_id text primary key,
  author_id     text,
  status        text,          -- 'draft'|'submitted'|'public'|'suspended'
  payload_json  text,
  created_at    timestamp,
  updated_at    timestamp
);
```

**設計メモ**

* ユニーク制約は **LWT（IF NOT EXISTS）** で代替。招待は *invite\_slots* の空きスロットを LWT で取得。
* **counter** は専用テーブルで分離（他列と混在しない）。
* セッション/一時トークンは **TTL** 指定で自動掃除。

---

## Next.js 実装要点（Route Handlers/SSE/認証/レート制御）

**接続**（Node ランタイム）：`@datastax/cassandra-driver`

```ts
// lib/cassandra.ts
import { Client } from '@datastax/cassandra-driver';
export const cassandra = new Client({
  contactPoints: process.env.CASSANDRA_CONTACT_POINTS!.split(','),
  localDataCenter: process.env.CASSANDRA_DC || 'dc1',
  keyspace: process.env.CASSANDRA_KEYSPACE || 'turtlesoup',
  credentials: { username: process.env.CASSANDRA_USER!, password: process.env.CASSANDRA_PASS! },
});
```

**ハンドル確保（LWT）**

```ts
// INSERT INTO handle_to_user (handle, user_id) VALUES (?, ?) IF NOT EXISTS
const res = await cassandra.execute(
  'INSERT INTO handle_to_user (handle, user_id) VALUES (?, ?) IF NOT EXISTS',
  [handle, userId], { prepare: true }
);
if (!res.wasApplied()) throw new Error('handle_taken');
```

**招待スロット取得（重複防止）**

```ts
for (let i = 0; i < 8; i++) {
  const slot = Math.floor(Math.random() * maxUses);
  const r = await cassandra.execute(
    'UPDATE invite_slots SET claimed_by=?, claimed_at=? WHERE code=? AND slot=? IF claimed_by = null',
    [userId, new Date(), code, slot], { prepare: true }
  );
  if (r.wasApplied()) break;
  if (i === 7) throw new Error('invite_exhausted');
}
```

**使用量カウンタ更新**

```ts
const day = new Date().toISOString().slice(0,10).replace(/-/g,'');
await cassandra.execute(
  'UPDATE usage_by_user_date SET calls = calls + 1, prompt_tokens = prompt_tokens + ?, output_tokens = output_tokens + ? WHERE user_id=? AND yyyymmdd=?',
  [pt, ot, userId, day], { prepare: true }
);
await cassandra.execute(
  'UPDATE usage_total_by_user SET calls = calls + 1, prompt_tokens = prompt_tokens + ?, output_tokens = output_tokens + ? WHERE user_id=?',
  [pt, ot, userId], { prepare: true }
);
```

**認証/UI**

* サインアップ：招待コード + ID（handle）+ PW → LWT で確保 → `users_by_id` 登録。
* ログイン：成功で **httpOnly Cookie** にセッションID（DBは TTL で自動失効）。
* オートログイン：Cookie 継続 + サイレント再発行。サーバ側で有効期限チェック。

**SSE（チャット）**

* Next.js Route Handler で **FastAPI の SSE をプロキシ**（または Next.js 側で直接生成）。
* 中断/再接続は `Last-Event-ID` or カーソルで再開。

**レート制御（UI/サーバ両面）**

* サーバ：API前段で当日/合計を読み出し、閾値超過で 429。
* フロント：`/api/me/usage` をポーリング表示、超過時はボタン disable + トースト。

---

## ロードマップ & Codex CLI 依頼テンプレ

**Milestone 0（雛形）**

* Next.js（App Router）初期化、`lib/cassandra.ts`、`/api/health`。
* 画面：`/themes`（一覧）・`/play/[id]`（会話）・`/login`。

**Milestone 1（認証/招待/使用量）**

* `/api/auth/signup`：招待スロット LWT、ハンドル LWT、`users_by_id` 登録。
* `/api/auth/login`：セッション発行（`sessions_by_id`、TTL）。
* `/api/me/usage`：日次/合計の取得、UI メーター表示。

**Milestone 2（進捗/いいね/キャラ）**

* クリア登録（`INSERT ... IF NOT EXISTS`）、いいね/解除（`likes_*` + `theme_like_counts`）。
* キャラ一覧/好感度 CRUD。

**Milestone 3（投稿/管理）**

* ユーザ投稿テーマ（下書き/申請/公開/停止）、招待発行画面、凍結/権限管理。

**Codex CLI 依頼テンプレ（例）**

```text
目的: Next.js(App Router)+Cassandraでユーザ招待/認証/使用量カウンタを実装。
前提: cassandra-driver を使い、上記CQLのテーブルが存在。
生成物:
1) lib/cassandra.ts 接続モジュール
2) /api/auth/signup, /api/auth/login の Route Handler
   - 招待スロット LWT、ハンドル LWT、users_by_id 登録、sessions_by_id TTL 発行
3) /api/me/usage 取得API と フロントのメーター表示（shadcn/uiのProgress）
4) /themes, /play/[id], /login の最小ページ（SSR）
注意: httpOnly Cookie, Nodeランタイム, 環境変数名 CASSANDRA_*
```

---

**備考**

* NoSQL β は β 提供のため SLA/ゾーン制約等あり。AppRun/ネットワーク配置は合わせる。
* 将来負荷増時は、イベントログや長期履歴を別テーブル/別クラスタに分離してスケール。

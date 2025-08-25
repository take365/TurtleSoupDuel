/* Keyspaceは事前作成または環境変数で指定してください */

/* ユーザ/認証 */
create table if not exists users_by_id (
  user_id    text primary key,
  handle     text,
  pw_hash    text,
  role       text,
  created_at timestamp
);

create table if not exists handle_to_user (
  handle     text primary key,
  user_id    text
);

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

/* 事前生成したスロットをLWTで奪取 */
create table if not exists invite_slots (
  code       text,
  slot       int,
  claimed_by text,
  claimed_at timestamp,
  primary key ((code), slot)
);


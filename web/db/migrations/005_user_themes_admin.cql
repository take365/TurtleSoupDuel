/* ユーザ投稿テーマ・ユーザフラグ（凍結）・管理用 */

create table if not exists user_themes (
  user_theme_id text primary key,
  author_id     text,
  status        text,          -- 'draft'|'submitted'|'public'|'suspended'
  payload_json  text,
  created_at    timestamp,
  updated_at    timestamp
);

create table if not exists user_flags_by_id (
  user_id text primary key,
  frozen  boolean
);


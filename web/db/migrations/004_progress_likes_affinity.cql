/* 進捗（クリア）・いいね・好感度・キャラ */

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


/* 使用量メーター用のカウンタテーブル */
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


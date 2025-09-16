# TurtleSoupDuel 開発メモ（キャラ導入とAPIスモーク）

本メモは、2025-09 時点の導入状況と、フロント非依存のAPI疎通（スモーク）手順をまとめたものです。

## 1. 目的 / 概要
- キャラクター（立ち絵＋感情）の最小導入方式を整理。
- フロントUIを使わず、Next(API)+FastAPI をHTTPで叩く疎通スクリプトを提供。
- DB（Cassandra）の簡易参照スクリプトも提供。

## 2. 前提（ローカル開発）
- FastAPI（ゲーム進行BFF）: `uvicorn app.main:app --reload --port 8000`
- Next.js（App Router, API含む）: `cd web && npm install && npm run dev`
- Cassandra 接続情報（`web/.env.local` など）
  - 例）
    - `CASSANDRA_CONTACT_POINTS=127.0.0.1:9042`
    - `CASSANDRA_KEYSPACE=turtlesoup`
    - `CASSANDRA_DC=dc1`
    - `CASSANDRA_USER=...` / `CASSANDRA_PASS=...`（必要に応じて）
- LLM（任意）
  - 既定は Mock。OpenAI を使う場合は FastAPI 側 `.env` にて: `MC_PROVIDER=openai`, `AI_PROVIDER=openai`, `OPENAI_API_KEY=...`

> 機密情報（APIキー等）はコミットしないこと。

## 3. キャラクター統合（現状）
- 配置先: `web/public/characters/<characterId>/`
  - 画像: `*.png`
  - 設定: `prompts.json`
- 統一6ラベル（2025-09 現在）
  - `平常心` / `興味・前進` / `惜しい・再考` / `否定・落胆` / `厳格・注意` / `喜び・勝利`
- 既存キャラ（例）
  - `ja_butler` … respectful/concerned/firm を割当（足りないラベルは暫定で neutral を再利用）
  - `Chip` … excited/sad/skeptical/mischievous を割当
  - `gorou` … angry/lazy/neutral を割当（足りないラベルは暫定で neutral）
- 表示
  - `/play/[themeId]` 左ペインに「キャラ（手動）」
  - キャラ選択（`ja_butler`/`Chip`/`gorou`）＋感情選択（セレクト）
  - 「自動切替」ONで MC判定（YES/NO/おしい/不適切）や WIN を検知し、6ラベルに基づき立ち絵切替（未定義は `平常心`→最初の定義へフォールバック）

### 3.1 新規キャラ追加（最小）
1) `web/public/characters/<id>/` を作成し、画像を配置。
2) `prompts.json` に上記6ラベルで `image` を割当（未用意は暫定で近い画像を再利用）。
3) `/play` のキャラ選択（現状は簡易リスト）に `<id>` を追加。

> 画像は後で差し替え可能。まずはラベルの骨組みを優先。

### 3.2 画像最適化（任意）
- スクリプト: `scripts/optimize_images.py`
- 仕様: 最大幅 1024px に縮小＋減色（PNG最適化）、再実行可
- 実行例:
  - `python3 -m venv .venv_tools && . .venv_tools/bin/activate && pip install pillow`
  - `python scripts/optimize_images.py`

## 4. DB 参照（スナップショット表示）
- スクリプト: `web/scripts/db_inspect.js`
- 実行: `cd web && npm run db:inspect`
- 対象テーブル（主なもの）
  - users_by_id / handle_to_user / sessions_by_id / user_flags_by_id
  - invites_by_code / invite_slots
  - usage_total_by_user / usage_by_user_date
  - themes_by_id / clears_by_user / likes_by_user / likes_by_theme / theme_like_counts
  - characters_by_id / affinity_by_user / user_themes
- 出力: 各テーブル 10件までのサンプル行（存在しないテーブルは警告表示）

## 5. API スモーク（E2E 風、フロントUI不使用）
- スクリプト: `web/scripts/test_e2e_smoke.js`
- 実行（既定値）: `cd web && npm run e2e:smoke`
- 環境変数（必要に応じて上書き）
  - `E2E_NEXT_BASE`（既定: `http://localhost:3000`）
  - `E2E_FASTAPI_BASE`（既定: `http://localhost:8000/api/v1`）
  - `E2E_HANDLE` / `E2E_PASSWORD` / `E2E_AI_MODEL`
- シナリオ概要
  1) 招待コードをCassandraへ直接INSERT（スロット生成）
  2) `POST /api/auth/signup`（Next）でユーザ作成（Cookie保持）
  3) `GET /api/auth/me`（Next）でログイン確認
  4) `GET /characters/ja_butler/prompts.json`（静的）でキャラ定義取得
  5) `GET /api/v1/themes`（FastAPI）でテーマ選択
  6) `POST /api/v1/game/start`（FastAPI）で開始
  7) `POST /api/v1/game/user/question` → MC判定受領
  8) `POST /api/v1/game/ai/question` / `POST /api/v1/game/ai/guess`
  9) `POST /api/v1/game/next` / `GET /api/v1/game/state`
  10) `POST /api/characters/{charId}/affinity`（Next）で好感度+5
- 期待結果
  - signup/login が 200 + Cookie（sid）発行
  - キャラ JSON の取得（6ラベル（キー）の存在）
  - テーマ一覧が1件以上
  - ゲームAPI各呼び出し 200 / judge/result/phase 正常
  - affinity 更新で `{ score: number }`

## 6. トラブルシューティング（簡易）
- `db_unavailable`（Next API）: Cassandra接続情報を確認（`CASSANDRA_*`）。
- FastAPI側の `.env` が読まれない: `app/main.py` で `.env` を自動読込（カレント直下）。位置を確認。
- LLMでOpenAIを使う: FastAPI 側 `.env` に `OPENAI_API_KEY` と `MC_PROVIDER/AI_PROVIDER=openai` を設定。未設定時は Mock。
- 画像が表示されない: `prompts.json` の `image` パスと `public/characters/<id>/` のファイル名を確認。

## 7. 備考
- 本メモは最小導入の運用メモです。将来、キャラ一覧API（FS列挙）や感情の自動切替高度化、CIでの自動スモークへ拡張予定。
- 機密（APIキー、ユーザデータ）は出力しない方針。必要時は `.env` / シークレット管理を使用。


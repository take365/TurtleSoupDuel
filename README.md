# TurtleSoupDuel (v0.1)

水平思考クイズ「うみがめのスープ」をAI進行役＋AI対戦者で最小構成動作させるAPIと簡易フロント。

## セットアップ

- 必要: Python 3.10+
- 推奨: `fastapi`, `uvicorn`

```
# 仮想環境（任意）
python -m venv .venv && source .venv/bin/activate

# 依存（例）
pip install fastapi uvicorn
```

## 起動

```
uvicorn app.main:app --reload --port 8000
```

- フロント: http://localhost:8000/
- API: http://localhost:8000/api/v1

## 環境変数

```
PORT=8000
MC_PROVIDER=openai
MC_MODEL=gpt-4o-mini
AI_PROVIDER=openai
AI_MODEL=gpt-4o-mini
OPENAI_API_KEY=sk-...
THEME_DIR=./themes
```

- `.env`自動ロード: サーバ起動時にカレントの`.env`を自動読込（`python-dotenv`）。`.env`が無い場合はOSの環境変数を使用します。

## 主要エンドポイント

- GET `/api/v1/themes`
- GET `/api/v1/themes/{id}`
- POST `/api/v1/game/start` `{ theme_id, ai_model }`
- POST `/api/v1/game/user/question` `{ text | pass }`
- POST `/api/v1/game/user/guess` `{ text | pass }`
- POST `/api/v1/game/ai/question`
- POST `/api/v1/game/ai/guess`
- POST `/api/v1/game/next`
- GET `/api/v1/game/state`

## 実装メモ

- v0.1はメモリ管理・単一ゲームのみ。
- LLMはネットワーク不要の`MockLLMProvider`で動作（`app/providers/mock.py`）。
- テーマは`themes/*.json`。

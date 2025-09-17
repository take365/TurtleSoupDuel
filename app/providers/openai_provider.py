import json
import os
import re
from typing import Any, Dict, List, Optional

from .base import LLMProvider


def _extract_json(text: str) -> Dict[str, Any]:
    try:
        return json.loads(text)
    except Exception:
        pass
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group(0))
        except Exception:
            pass
    return {}


def _history_json(history: List[Dict[str, Any]], limit: int) -> str:
    payload: List[Dict[str, Any]] = []
    for h in history[-limit:]:
        entry: Dict[str, Any] = {}
        for key in ("actor", "kind", "text", "pass", "judge", "note", "result", "provider", "model"):
            value = h.get(key)
            if value not in (None, ""):
                entry[key] = value
        payload.append(entry)
    return json.dumps(payload, ensure_ascii=False, indent=2)


class OpenAILLMProvider(LLMProvider):
    def __init__(self, model: Optional[str] = None, role: str = "mc") -> None:
        from openai import OpenAI  # lazy import

        self.client = OpenAI()
        self.model = model or os.getenv("MC_MODEL") or "gpt-4o-mini"
        self.role = role

    # MC: Judge yes/no
    def ask_mc_judge(self, theme: Dict[str, Any], history: list, question: str) -> Dict[str, Any]:
        sys = (
            "あなたは水平思考クイズの進行役です。正解情報(解説/事実)は外部に漏らさず、"
            "ユーザの質問がYes/Noでどう判定されるかを厳密に判断し、JSONのみを返答してください。"
            "出力: {\"judge\": \"YES|NO|おしい|不適切\", \"note\": \"短い補足\"}"
        )
        hidden_context = (
            f"[内部情報] 題名: {theme.get('title')} / 解説: {theme.get('solution')} / "
            f"事実: {', '.join(theme.get('facts') or [])}"
        )
        user = f"質問: {question}"
        print(f"[LLM][OpenAI][mc_judge] model={self.model} q='{(question or '')[:100]}'")
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": sys},
                {"role": "system", "content": hidden_context},
                {"role": "user", "content": user},
            ],
            temperature=0.2,
        )
        text = resp.choices[0].message.content or "{}"
        data = _extract_json(text)
        judge = data.get("judge") or "おしい"
        note = data.get("note") or ""
        print(f"[LLM][OpenAI][mc_judge] -> judge={judge} note='{note}' raw_len={len(text)}")
        return {"judge": judge, "note": note}

    # MC: Verify final answer
    def ask_mc_verify(self, theme: Dict[str, Any], guess: str) -> Dict[str, Any]:
        sys = (
            "あなたは進行役です。以下の最終解答が正解か厳密に判定し、JSONのみを出力してください。"
            "出力: {\"result\": \"CORRECT|WRONG\"}"
        )
        hidden_context = (
            f"[内部情報] 題名: {theme.get('title')} / 解説: {theme.get('solution')} / "
            f"事実: {', '.join(theme.get('facts') or [])}"
        )
        user = f"最終解答: {guess}"
        print(f"[LLM][OpenAI][mc_verify] model={self.model} guess='{(guess or '')[:100]}'")
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": sys},
                {"role": "system", "content": hidden_context},
                {"role": "user", "content": user},
            ],
            temperature=0.0,
        )
        text = resp.choices[0].message.content or "{}"
        data = _extract_json(text)
        result = data.get("result") or "WRONG"
        print(f"[LLM][OpenAI][mc_verify] -> result={result} raw_len={len(text)}")
        return {"result": "CORRECT" if result == "CORRECT" else "WRONG"}

    # AI: Generate a yes/no question (text only)
    def ai_generate_question(self, theme: Dict[str, Any], history: list) -> Dict[str, Any]:
        sys = (
            "あなたはAI対戦者です。情報利得が高く、重複しないYes/No質問を日本語で1つだけ出力してください。"
            "文以外の出力は禁止。"
        )
        history_json = _history_json(history, limit=12)
        user = (
            f"題名: {theme.get('title')}\n問題: {theme.get('question')}\n"
            "直近の履歴(JSON):\n"
            f"{history_json}"
        )
        print(f"[LLM][OpenAI][ai_question] model={self.model}")
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": sys},
                {"role": "user", "content": user},
            ],
            temperature=0.7,
        )
        text = (resp.choices[0].message.content or "").strip()
        # 1行化
        text = text.splitlines()[0].strip()
        print(f"[LLM][OpenAI][ai_question] -> '{text[:100]}'")
        return {"text": text}

    # AI: Generate final guess (text only)
    def ai_generate_guess(self, theme: Dict[str, Any], history: list) -> Dict[str, Any]:
        sys = (
            "あなたはAI対戦者です。これまでの履歴から導かれる最終解答を日本語で簡潔に1文で述べてください。"
            "文以外の出力は禁止。"
        )
        history_json = _history_json(history, limit=14)
        user = (
            f"題名: {theme.get('title')}\n問題: {theme.get('question')}\n"
            "直近の履歴(JSON):\n"
            f"{history_json}"
        )
        print(f"[LLM][OpenAI][ai_guess] model={self.model}")
        resp = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": sys},
                {"role": "user", "content": user},
            ],
            temperature=0.7,
        )
        text = (resp.choices[0].message.content or "").strip()
        text = text.splitlines()[0].strip()
        print(f"[LLM][OpenAI][ai_guess] -> '{text[:100]}'")
        return {"text": text}

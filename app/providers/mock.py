import re
from typing import Dict, Any, List

from .base import LLMProvider


def _norm(s: str) -> str:
    return re.sub(r"\s+", " ", s).strip().lower()


class MockLLMProvider(LLMProvider):
    """
    A deterministic provider for local testing without network.
    Rules:
    - Judge: answer YES/NO by naive keyword checks against facts/solution; otherwise "おしい" if overlaps, else "不適切" for non-yes/no questions.
    - Verify: CORRECT if guess text shares significant tokens with the solution.
    - AI question: pick from a small heuristic list trying to cover facts.
    - AI guess: produce a concise summary using keywords from facts/solution.
    """

    def _keywords(self, theme: Dict[str, Any]) -> List[str]:
        keys: List[str] = []
        text = " ".join(
            [theme.get("solution", ""), " ".join(theme.get("facts") or [])]
        )
        for tok in re.findall(r"[\wぁ-んァ-ヶ一-龠々ー]+", text.lower()):
            if len(tok) >= 2 and tok not in keys:
                keys.append(tok)
        return keys[:50]

    def ask_mc_judge(self, theme: Dict[str, Any], history: list, question: str) -> Dict[str, Any]:
        q = _norm(question or "")
        if not q:
            return {"judge": "不適切", "note": "質問が空です"}
        # Expect yes/no? naive detection
        if not re.search(r"\b(か|ですか|\?|is|are|do|does|did)\b", q):
            # still accept, but mark as それっぽくない
            pass

        keys = self._keywords(theme)
        matches = [k for k in keys if k in q]
        if not matches:
            return {"judge": "NO", "note": "関係が薄いようです"}
        if len(matches) >= 3:
            return {"judge": "YES", "note": "核心に近いです"}
        return {"judge": "おしい", "note": "一部は合っています"}

    def ask_mc_verify(self, theme: Dict[str, Any], guess: str) -> Dict[str, Any]:
        g = _norm(guess or "")
        sol = _norm(theme.get("solution", ""))
        if not g:
            return {"result": "WRONG"}
        # Token overlap ratio
        gtoks = set(re.findall(r"[\wぁ-んァ-ヶ一-龠々ー]+", g))
        stoks = set(re.findall(r"[\wぁ-んァ-ヶ一-龠々ー]+", sol))
        if not gtoks or not stoks:
            return {"result": "WRONG"}
        overlap = len(gtoks & stoks) / max(1, len(gtoks))
        return {"result": "CORRECT" if overlap >= 0.5 else "WRONG"}

    def ai_generate_question(self, theme: Dict[str, Any], history: list) -> Dict[str, Any]:
        asked = set(
            _norm(h.get("text", ""))
            for h in history
            if h.get("actor") == "ai" and h.get("kind") == "question"
        )
        candidates = [
            "それは過去の出来事に関連しますか？",
            "場所は重要ですか？",
            "他の人物が関与していますか？",
            "誤解が関係していますか？",
            "ある特定の食べ物が重要ですか？",
        ]
        for c in candidates:
            if _norm(c) not in asked:
                # Immediately judge with the same logic to return combined payload
                j = self.ask_mc_judge(theme, history, c)
                return {"text": c, **j}
        # Fallback generic
        c = "時間経過は重要ですか？"
        j = self.ask_mc_judge(theme, history, c)
        return {"text": c, **j}

    def ai_generate_guess(self, theme: Dict[str, Any], history: list) -> Dict[str, Any]:
        # Naively attempt to summarize by taking first sentence of solution
        sol = theme.get("solution", "").strip()
        text = sol.split("。")[0] + "。" if sol else "わかりません。"
        return {"text": text}


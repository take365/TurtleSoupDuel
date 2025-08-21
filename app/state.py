from dataclasses import dataclass, asdict
from typing import List, Optional, Literal, Dict, Any

from .theme_loader import load_theme, Theme
from .providers.mock import MockLLMProvider


Phase = Literal[
    "USER_Q",
    "MC_A",
    "USER_GUESS",
    "MC_JUDGE",
    "AI_Q",
    "AI_MC_A",
    "AI_GUESS",
    "AI_MC_JUDGE",
    "IDLE",
    "WIN",
    "FINISHED",
]


@dataclass
class QARec:
    actor: Literal["user", "ai"]
    kind: Literal["question", "guess"]
    text: Optional[str]
    pass_: bool
    judge: Optional[Literal["YES", "NO", "おしい", "不適切"]] = None
    note: Optional[str] = None
    result: Optional[Literal["CORRECT", "WRONG"]] = None


@dataclass
class GameState:
    status: Literal["IDLE", "THEME_SELECTED", "IN_TURN", "WIN", "FINISHED"] = "IDLE"
    theme: Optional[Theme] = None
    turn: int = 0
    phase: Phase = "IDLE"
    history: List[QARec] = None  # type: ignore
    winner: Optional[Literal["user", "ai"]] = None
    models: Dict[str, str] = None  # type: ignore


class GameManager:
    def __init__(self) -> None:
        self.state = GameState(history=[], models={})
        # Providers (both mock for v0.1 local)
        self.mc = MockLLMProvider()
        self.ai = MockLLMProvider()

    # Lifecycle
    def start_game(self, theme_id: str, ai_model: str) -> None:
        theme = load_theme(theme_id)
        self.state = GameState(
            status="IN_TURN",
            theme=theme,
            turn=1,
            phase="USER_Q",
            history=[],
            winner=None,
            models={"mc_model": "mock", "ai_model": ai_model or "mock"},
        )

    # User
    def user_question(self, text: Optional[str], is_pass: bool) -> Dict[str, Any]:
        if self.state.phase != "USER_Q":
            raise ValueError("invalid_phase")
        rec = QARec(actor="user", kind="question", text=text, pass_=bool(is_pass))
        self.state.history.append(rec)
        judge = self.mc.ask_mc_judge(asdict(self.state.theme), self._hist_dicts(), text or "")  # type: ignore
        rec.judge = judge.get("judge")
        rec.note = judge.get("note")
        # Advance to next
        self.state.phase = "USER_GUESS"
        return judge

    def user_guess(self, text: Optional[str], is_pass: bool) -> Dict[str, Any]:
        if self.state.phase != "USER_GUESS":
            raise ValueError("invalid_phase")
        rec = QARec(actor="user", kind="guess", text=text, pass_=bool(is_pass))
        self.state.history.append(rec)
        res = self.mc.ask_mc_verify(asdict(self.state.theme), text or "")  # type: ignore
        rec.result = res.get("result")
        if rec.result == "CORRECT":
            self.state.winner = "user"
            self.state.status = "WIN"
            self.state.phase = "WIN"
            return {"result": "CORRECT", "is_win": True}
        # Advance to AI question
        self.state.phase = "AI_Q"
        return {"result": "WRONG", "is_win": False}

    # AI
    def ai_question(self) -> Dict[str, Any]:
        if self.state.phase != "AI_Q":
            raise ValueError("invalid_phase")
        res = self.ai.ai_generate_question(asdict(self.state.theme), self._hist_dicts())  # type: ignore
        rec = QARec(actor="ai", kind="question", text=res.get("text"), pass_=False)
        rec.judge = res.get("judge")
        rec.note = res.get("note")
        self.state.history.append(rec)
        # Advance to AI guess phase
        self.state.phase = "AI_GUESS"
        return {"text": rec.text, "judge": rec.judge, "note": rec.note}

    def ai_guess(self) -> Dict[str, Any]:
        if self.state.phase != "AI_GUESS":
            raise ValueError("invalid_phase")
        gen = self.ai.ai_generate_guess(asdict(self.state.theme), self._hist_dicts())  # type: ignore
        text = gen.get("text")
        rec = QARec(actor="ai", kind="guess", text=text, pass_=False)
        self.state.history.append(rec)
        res = self.mc.ask_mc_verify(asdict(self.state.theme), text or "")  # type: ignore
        rec.result = res.get("result")
        if rec.result == "CORRECT":
            self.state.winner = "ai"
            self.state.status = "WIN"
            self.state.phase = "WIN"
            return {"text": text, "result": "CORRECT", "is_win": True}
        # Advance turn
        self.state.turn += 1
        self.state.phase = "USER_Q"
        return {"text": text, "result": "WRONG", "is_win": False}

    def next_phase(self) -> Dict[str, Any]:
        # In this minimal v0.1, actions advance phases themselves.
        # next_phase finalizes WIN -> FINISHED only.
        last: List[Dict[str, Any]] = self._hist_dicts()[-2:]
        if self.state.phase == "WIN" and self.state.status == "WIN":
            self.state.status = "FINISHED"
            self.state.phase = "FINISHED"
        return {
            "game_status": self.state.status,
            "current_turn": self.state.turn,
            "phase": self.state.phase,
            "last_events": last,
        }

    def snapshot(self) -> Dict[str, Any]:
        return {
            "theme_id": self.state.theme.id if self.state.theme else None,
            "turn": self.state.turn,
            "phase": self.state.phase,
            "history": [
                {
                    "actor": h.actor,
                    "kind": h.kind,
                    "text": h.text,
                    "pass": h.pass_,
                    "judge": h.judge,
                    "note": h.note,
                    "result": h.result,
                }
                for h in self.state.history
            ],
            "winner": self.state.winner,
        }

    def _hist_dicts(self) -> List[Dict[str, Any]]:
        return [
            {
                "actor": h.actor,
                "kind": h.kind,
                "text": h.text,
                "pass": h.pass_,
                "judge": h.judge,
                "note": h.note,
                "result": h.result,
            }
            for h in self.state.history
        ]


game_manager = GameManager()


from dataclasses import dataclass, asdict
from typing import List, Optional, Literal, Dict, Any

from .theme_loader import load_theme, Theme
import os
from .providers.factory import create_provider


MAX_TURNS = 10


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
    "DRAW",
    "FINISHED",
]


@dataclass
class QARec:
    actor: Literal["user", "ai", "mc"]
    kind: Literal["question", "guess", "note"]
    text: Optional[str]
    pass_: bool
    judge: Optional[Literal["YES", "NO", "おしい", "不適切"]] = None
    note: Optional[str] = None
    result: Optional[Literal["CORRECT", "WRONG"]] = None
    provider: Optional[str] = None
    model: Optional[str] = None


@dataclass
class GameState:
    status: Literal["IDLE", "THEME_SELECTED", "IN_TURN", "WIN", "DRAW", "FINISHED"] = "IDLE"
    theme: Optional[Theme] = None
    turn: int = 0
    phase: Phase = "IDLE"
    history: List[QARec] = None  # type: ignore
    winner: Optional[Literal["user", "ai"]] = None
    models: Dict[str, str] = None  # type: ignore


class GameManager:
    def __init__(self) -> None:
        self.state = GameState(history=[], models={})
        # Initialize providers from env
        self.mc = create_provider(os.getenv("MC_PROVIDER", "mock"), os.getenv("MC_MODEL"), role="mc")
        self.ai = create_provider(os.getenv("AI_PROVIDER", "mock"), os.getenv("AI_MODEL"), role="ai")
        print(f"[INIT] MC provider={os.getenv('MC_PROVIDER', 'mock')} model={os.getenv('MC_MODEL', 'gpt-4o-mini')}")
        print(f"[INIT] AI provider={os.getenv('AI_PROVIDER', os.getenv('MC_PROVIDER', 'mock'))} model={os.getenv('AI_MODEL', os.getenv('MC_MODEL', 'gpt-4o-mini'))}")

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
            models={
                "mc_model": os.getenv("MC_MODEL") or "gpt-4o-mini",
                "ai_model": ai_model or os.getenv("AI_MODEL") or os.getenv("MC_MODEL") or "gpt-4o-mini",
                "mc_provider": (os.getenv("MC_PROVIDER") or "mock").lower(),
                "ai_provider": (os.getenv("AI_PROVIDER") or os.getenv("MC_PROVIDER") or "mock").lower(),
            },
        )
        # Recreate AI provider according to requested model/provider
        ai_provider = os.getenv("AI_PROVIDER", os.getenv("MC_PROVIDER", "mock"))
        self.ai = create_provider(ai_provider, self.state.models["ai_model"], role="ai")
        print(
            f"[GAME] start theme={theme_id} mc={self.state.models['mc_provider']}:{self.state.models['mc_model']} ai={self.state.models['ai_provider']}:{self.state.models['ai_model']}"
        )

    # User
    def user_question(self, text: Optional[str], is_pass: bool) -> Dict[str, Any]:
        if self.state.phase != "USER_Q":
            raise ValueError("invalid_phase")
        rec = QARec(actor="user", kind="question", text=text, pass_=bool(is_pass))
        self.state.history.append(rec)
        print(f"[API] /user/question -> '{(text or '')[:120]}'")
        judge = self.mc.ask_mc_judge(asdict(self.state.theme), self._hist_dicts(), text or "")  # type: ignore
        rec.judge = judge.get("judge")
        rec.note = judge.get("note")
        print(f"[JUDGE] mc={self.state.models['mc_provider']}:{self.state.models['mc_model']} -> {rec.judge} ({rec.note or ''})")
        # Advance to next
        self.state.phase = "USER_GUESS"
        return judge

    def user_guess(self, text: Optional[str], is_pass: bool) -> Dict[str, Any]:
        if self.state.phase != "USER_GUESS":
            raise ValueError("invalid_phase")
        rec = QARec(actor="user", kind="guess", text=text, pass_=bool(is_pass))
        self.state.history.append(rec)
        print(f"[API] /user/guess -> '{(text or '')[:120]}'")
        res = self.mc.ask_mc_verify(asdict(self.state.theme), text or "")  # type: ignore
        rec.result = res.get("result")
        if rec.result == "CORRECT":
            self.state.winner = "user"
            self.state.status = "WIN"
            self.state.phase = "WIN"
            print("[JUDGE] user guess -> CORRECT (user win)")
            explanation = self._build_explanation()
            if explanation:
                self.state.history.append(
                    QARec(actor="mc", kind="note", text=explanation, pass_=False, note="解説")
                )
            return {
                "result": "CORRECT",
                "is_win": True,
                "winner": "user",
                "explanation": explanation,
                "is_draw": False,
            }
        # Advance to AI question
        self.state.phase = "AI_Q"
        print("[JUDGE] user guess -> WRONG (AI_Q phase)")
        return {"result": "WRONG", "is_win": False, "winner": None, "is_draw": False}

    # AI
    def ai_question(self) -> Dict[str, Any]:
        if self.state.phase != "AI_Q":
            raise ValueError("invalid_phase")
        res = self.ai.ai_generate_question(asdict(self.state.theme), self._hist_dicts())  # type: ignore
        rec = QARec(actor="ai", kind="question", text=res.get("text"), pass_=False)
        # Judge by MC provider
        judge = self.mc.ask_mc_judge(asdict(self.state.theme), self._hist_dicts(), rec.text or "")  # type: ignore
        rec.judge = judge.get("judge")
        rec.note = judge.get("note")
        rec.provider = self.state.models.get("ai_provider")
        rec.model = self.state.models.get("ai_model")
        self.state.history.append(rec)
        # Advance to AI guess phase
        self.state.phase = "AI_GUESS"
        print(f"[AI] question by {rec.provider}:{rec.model} -> '{(rec.text or '')[:120]}' | judge={rec.judge}")
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
            rec.provider = self.state.models.get("ai_provider")
            rec.model = self.state.models.get("ai_model")
            explanation = self._build_explanation()
            if explanation:
                self.state.history.append(
                    QARec(actor="mc", kind="note", text=explanation, pass_=False, note="解説")
                )
            print(f"[AI] guess by {rec.provider}:{rec.model} -> CORRECT (ai win)")
            return {
                "text": text,
                "result": "CORRECT",
                "is_win": True,
                "winner": "ai",
                "explanation": explanation,
                "is_draw": False,
            }
        if self.state.turn >= MAX_TURNS:
            self.state.status = "DRAW"
            self.state.phase = "DRAW"
            draw_note = "10ターン経過したため引き分けです。"
            self.state.history.append(
                QARec(actor="mc", kind="note", text=draw_note, pass_=False, note="引き分け")
            )
            print(f"[GAME] draw reached after {self.state.turn} turns")
            return {
                "text": text,
                "result": "WRONG",
                "is_win": False,
                "winner": None,
                "is_draw": True,
            }
        # Advance turn
        self.state.turn += 1
        self.state.phase = "USER_Q"
        rec.provider = self.state.models.get("ai_provider")
        rec.model = self.state.models.get("ai_model")
        print(f"[AI] guess by {rec.provider}:{rec.model} -> WRONG (turn {self.state.turn})")
        return {
            "text": text,
            "result": "WRONG",
            "is_win": False,
            "winner": None,
            "is_draw": False,
        }

    def next_phase(self) -> Dict[str, Any]:
        # In this minimal v0.1, actions advance phases themselves.
        # next_phase finalizes WIN -> FINISHED only.
        last: List[Dict[str, Any]] = self._hist_dicts()[-2:]
        status = self.state.status
        phase = self.state.phase
        if self.state.phase == "WIN" and self.state.status == "WIN":
            self.state.status = "FINISHED"
            self.state.phase = "FINISHED"
            print("[GAME] finalized -> FINISHED")
        elif self.state.phase == "DRAW" and self.state.status == "DRAW":
            self.state.status = "FINISHED"
            self.state.phase = "FINISHED"
            print("[GAME] finalized -> DRAW/FINISHED")
        return {
            "game_status": status,
            "current_turn": self.state.turn,
            "phase": phase,
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
                    "provider": getattr(h, "provider", None),
                    "model": getattr(h, "model", None),
                }
                for h in self.state.history
            ],
            "winner": self.state.winner,
            "models": self.state.models,
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

    def _build_explanation(self) -> Optional[str]:
        if not self.state.theme:
            return None
        parts = [self.state.theme.solution.strip()] if self.state.theme.solution else []
        facts = self.state.theme.facts or []
        if facts:
            parts.append("補足: " + " / ".join(facts))
        explanation = "\n".join(p for p in parts if p)
        return explanation or None


game_manager = GameManager()

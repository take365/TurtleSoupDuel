from typing import List, Literal, Optional
from pydantic import BaseModel, Field


JudgeLiteral = Literal["YES", "NO", "おしい", "不適切"]


class StartGameRequest(BaseModel):
    theme_id: str
    ai_model: Optional[str] = None


class StartGameResponse(BaseModel):
    game_status: Literal["IN_TURN"]
    current_turn: int
    player: Literal["user"]


class UserQuestionRequest(BaseModel):
    text: Optional[str] = None
    pass_: Optional[bool] = Field(default=False, alias="pass")


class UserQuestionResponse(BaseModel):
    judge: JudgeLiteral
    note: Optional[str] = None


class UserGuessRequest(BaseModel):
    text: Optional[str] = None
    pass_: Optional[bool] = Field(default=False, alias="pass")


class UserGuessResponse(BaseModel):
    result: Literal["CORRECT", "WRONG"]
    is_win: bool


class AIQuestionResponse(BaseModel):
    text: str
    judge: JudgeLiteral
    note: Optional[str] = None


class AIGuessResponse(BaseModel):
    text: str
    result: Literal["CORRECT", "WRONG"]
    is_win: bool


class QA(BaseModel):
    actor: Literal["user", "ai"]
    kind: Literal["question", "guess"]
    text: Optional[str]
    pass_: bool = Field(alias="pass")
    judge: Optional[JudgeLiteral] = None
    note: Optional[str] = None
    result: Optional[Literal["CORRECT", "WRONG"]] = None
    provider: Optional[str] = None
    model: Optional[str] = None


class GameStateSnapshot(BaseModel):
    theme_id: Optional[str]
    turn: int
    phase: Literal[
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
    history: List[QA]
    winner: Optional[Literal["user", "ai"]] = None
    models: Optional[dict] = None


class NextTurnResponse(BaseModel):
    game_status: Literal["IDLE", "THEME_SELECTED", "IN_TURN", "WIN", "FINISHED"]
    current_turn: int
    phase: GameStateSnapshot.__annotations__["phase"]  # type: ignore
    last_events: List[QA]


class ThemeSummary(BaseModel):
    id: str
    title: str
    tags: Optional[List[str]] = None
    lang: Optional[str] = None


class ThemePublic(BaseModel):
    id: str
    title: str
    question: str
    tags: Optional[List[str]] = None
    lang: Optional[str] = None

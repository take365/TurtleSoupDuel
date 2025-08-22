from fastapi import APIRouter, HTTPException
from fastapi import status
from typing import List, Optional, Literal

from ..state import game_manager
from ..theme_loader import ThemeSummary, get_themes, get_theme_public
from ..schemas import (
    StartGameRequest,
    StartGameResponse,
    UserQuestionRequest,
    UserQuestionResponse,
    UserGuessRequest,
    UserGuessResponse,
    AIQuestionResponse,
    AIGuessResponse,
    GameStateSnapshot,
    NextTurnResponse,
)

router = APIRouter()


@router.get("/themes", response_model=List[ThemeSummary])
def list_themes():
    res = get_themes()
    print(f"[API] GET /themes -> {len(res)} items")
    return res


@router.get("/themes/{theme_id}")
def get_theme(theme_id: str):
    pub = get_theme_public(theme_id)
    if pub is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="theme_not_found")
    print(f"[API] GET /themes/{theme_id} -> ok")
    return pub


@router.post("/game/start", response_model=StartGameResponse)
def start_game(req: StartGameRequest):
    try:
        game_manager.start_game(req.theme_id, req.ai_model)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="theme_not_found")
    print(f"[API] POST /game/start theme={req.theme_id} ai_model={req.ai_model}")
    return StartGameResponse(game_status="IN_TURN", current_turn=1, player="user")


@router.post("/game/user/question", response_model=UserQuestionResponse)
def user_question(req: UserQuestionRequest):
    try:
        judge = game_manager.user_question(req.text, bool(req.pass_))
        print(f"[API] POST /game/user/question -> {judge}")
        return UserQuestionResponse(**judge)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="invalid_phase")


@router.post("/game/user/guess", response_model=UserGuessResponse)
def user_guess(req: UserGuessRequest):
    try:
        res = game_manager.user_guess(req.text, bool(req.pass_))
        print(f"[API] POST /game/user/guess -> {res}")
        return UserGuessResponse(**res)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="invalid_phase")


@router.post("/game/ai/question", response_model=AIQuestionResponse)
def ai_question():
    try:
        res = game_manager.ai_question()
        print(f"[API] POST /game/ai/question -> {res}")
        return AIQuestionResponse(**res)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="invalid_phase")


@router.post("/game/ai/guess", response_model=AIGuessResponse)
def ai_guess():
    try:
        res = game_manager.ai_guess()
        print(f"[API] POST /game/ai/guess -> {res}")
        return AIGuessResponse(**res)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="invalid_phase")


@router.post("/game/next", response_model=NextTurnResponse)
def next_turn():
    try:
        res = game_manager.next_phase()
        print(f"[API] POST /game/next -> {res['phase']} status={res['game_status']}")
        return NextTurnResponse(**res)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="invalid_phase")


@router.get("/game/state", response_model=GameStateSnapshot)
def get_state():
    snap = game_manager.snapshot()
    print(f"[API] GET /game/state -> phase={snap['phase']} turn={snap['turn']}")
    return snap

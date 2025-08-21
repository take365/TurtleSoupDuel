import json
import os
from dataclasses import dataclass
from typing import List, Optional, Dict, Any

from .schemas import ThemeSummary, ThemePublic


THEME_DIR = os.getenv("THEME_DIR", "./themes")


@dataclass
class Theme:
    id: str
    title: str
    question: str
    solution: str
    facts: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    lang: Optional[str] = None


def _iter_theme_files() -> List[str]:
    if not os.path.isdir(THEME_DIR):
        return []
    files = [
        os.path.join(THEME_DIR, f)
        for f in os.listdir(THEME_DIR)
        if f.endswith(".json") and os.path.isfile(os.path.join(THEME_DIR, f))
    ]
    return sorted(files)


def _load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def get_themes() -> List[ThemeSummary]:
    summaries: List[ThemeSummary] = []
    for path in _iter_theme_files():
        data = _load_json(path)
        summaries.append(
            ThemeSummary(
                id=data["id"],
                title=data["title"],
                tags=data.get("tags"),
                lang=data.get("lang"),
            )
        )
    return summaries


def get_theme_public(theme_id: str) -> Optional[ThemePublic]:
    for path in _iter_theme_files():
        data = _load_json(path)
        if data.get("id") == theme_id:
            return ThemePublic(
                id=data["id"],
                title=data["title"],
                question=data["question"],
                tags=data.get("tags"),
                lang=data.get("lang"),
            )
    return None


def load_theme(theme_id: str) -> Theme:
    for path in _iter_theme_files():
        data = _load_json(path)
        if data.get("id") == theme_id:
            return Theme(
                id=data["id"],
                title=data["title"],
                question=data["question"],
                solution=data["solution"],
                facts=data.get("facts"),
                tags=data.get("tags"),
                lang=data.get("lang"),
            )
    raise FileNotFoundError(theme_id)


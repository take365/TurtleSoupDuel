from dataclasses import dataclass
from typing import List, Optional

from cassandra.cluster import ResultSet, NoHostAvailable

from .schemas import ThemeSummary, ThemePublic
from .cassandra_client import get_session


@dataclass
class Theme:
    id: str
    title: str
    question: str
    solution: str
    facts: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    lang: Optional[str] = None
def get_themes() -> List[ThemeSummary]:
    try:
        session = get_session()
        rows: ResultSet = session.execute(
            "SELECT theme_id, title, tags, lang FROM themes_by_id"
        )
    except NoHostAvailable as exc:  # pragma: no cover - depends on runtime infra
        raise RuntimeError("cassandra_unavailable") from exc
    summaries: List[ThemeSummary] = []
    for row in rows:
        theme_id = getattr(row, "theme_id", None)
        if not theme_id:
            continue
        tags = list(getattr(row, "tags", []) or [])
        lang = getattr(row, "lang", None)
        title = getattr(row, "title", "")
        summaries.append(ThemeSummary(id=theme_id, title=title, tags=tags or None, lang=lang))
    return summaries


def get_theme_public(theme_id: str) -> Optional[ThemePublic]:
    try:
        session = get_session()
        row = session.execute(
            "SELECT theme_id, title, question, tags, lang FROM themes_by_id WHERE theme_id=%s",
            (theme_id,),
        ).one()
    except NoHostAvailable as exc:  # pragma: no cover
        raise RuntimeError("cassandra_unavailable") from exc
    if row is None:
        return None
    tags = list(getattr(row, "tags", []) or [])
    return ThemePublic(
        id=getattr(row, "theme_id"),
        title=getattr(row, "title", ""),
        question=getattr(row, "question", ""),
        tags=tags or None,
        lang=getattr(row, "lang", None),
    )


def load_theme(theme_id: str) -> Theme:
    try:
        session = get_session()
        row = session.execute(
            "SELECT theme_id, title, question, solution, facts, tags, lang FROM themes_by_id WHERE theme_id=%s",
            (theme_id,),
        ).one()
    except NoHostAvailable as exc:  # pragma: no cover
        raise RuntimeError("cassandra_unavailable") from exc
    if row is None:
        raise FileNotFoundError(theme_id)
    facts = list(getattr(row, "facts", []) or [])
    tags = list(getattr(row, "tags", []) or [])
    return Theme(
        id=getattr(row, "theme_id"),
        title=getattr(row, "title", ""),
        question=getattr(row, "question", ""),
        solution=getattr(row, "solution", ""),
        facts=facts or None,
        tags=tags or None,
        lang=getattr(row, "lang", None),
    )

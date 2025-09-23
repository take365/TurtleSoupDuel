# app/bulk_theme_loader.py
"""
Bulk import / upsert themes into Cassandra.

- Accepts:
  1) {"items": [ {...}, {...} ]}  // your current format
  2) single JSON object
  3) NDJSON (one JSON per line)

- Field mapping:
  id or theme_id -> theme_id (required unless --autogen-prefix)
  title or title_original -> title
  question or abstract_question -> question
  solution or abstract_solution -> solution
  facts (optional list[str])
  tags  (optional list[str])
  lang  (optional str, e.g., "ja")

Prints a JSON summary to STDOUT and logs basic progress.
"""

import argparse
import json
import sys
import uuid
from typing import Any, Dict, List, Optional, Tuple
from dotenv import load_dotenv
load_dotenv()  # .env を自動で探して環境変数にロード

# ---- project-local session provider
from app.cassandra_client import get_session  # 既存の接続ユーティリティを利用

# ---------- util ----------
def _coerce_list(val: Any) -> Optional[List[str]]:
    if val is None:
        return None
    if isinstance(val, list):
        return [str(x) for x in val if x is not None] or None
    if isinstance(val, str):
        parts = [p.strip() for p in val.split(",") if p.strip()]
        return parts or None
    return None

def normalize_item(raw: Dict[str, Any], autogen_prefix: Optional[str]) -> Dict[str, Any]:
    theme_id = raw.get("id") or raw.get("theme_id")
    if not theme_id and autogen_prefix:
        theme_id = f"{autogen_prefix}-{uuid.uuid4().hex[:8]}"
    if not theme_id:
        raise ValueError("Missing required 'id'. Provide --autogen-prefix to auto-generate.")

    title = raw.get("title") or raw.get("title_original") or ""
    question = raw.get("question") or raw.get("abstract_question") or ""
    solution = raw.get("solution") or raw.get("abstract_solution") or ""
    facts = _coerce_list(raw.get("facts"))
    tags = _coerce_list(raw.get("tags"))
    lang = raw.get("lang")

    return {
        "theme_id": str(theme_id),
        "title": str(title),
        "question": str(question),
        "solution": str(solution),
        "facts": facts,
        "tags": tags,
        "lang": str(lang) if lang else None,
    }

def load_input(path: str) -> List[Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        data = f.read()
    items: List[Dict[str, Any]] = []
    # JSON first
    try:
        obj = json.loads(data)
        if isinstance(obj, dict) and "items" in obj and isinstance(obj["items"], list):
            items = [x for x in obj["items"] if isinstance(x, dict)]
        elif isinstance(obj, dict):
            items = [obj]
        elif isinstance(obj, list):
            items = [x for x in obj if isinstance(x, dict)]
        else:
            raise ValueError("Top-level JSON must be object or array")
        return items
    except json.JSONDecodeError:
        pass
    # NDJSON
    for line in data.splitlines():
        line = line.strip()
        if not line:
            continue
        items.append(json.loads(line))
    if not items:
        raise ValueError("No items found in input. Expected JSON with 'items' or NDJSON.")
    return items

# ---------- DB write ----------
def upsert_items(items: List[Dict[str, Any]], batch_size: int = 64, simulate: bool = False, verbose: bool = False) -> Tuple[int, List[str]]:
    if simulate:
        for it in items:
            print(json.dumps(it, ensure_ascii=False), file=sys.stderr)
        return len(items), []

    session = get_session()
    ps = session.prepare(
        "INSERT INTO themes_by_id (theme_id, title, question, solution, facts, tags, lang) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )

    written = 0
    failed: List[str] = []
    for i in range(0, len(items), batch_size):
        chunk = items[i:i+batch_size]
        if verbose:
            print(f"[INFO] writing {i+1}..{i+len(chunk)} / {len(items)}", file=sys.stderr)
        for it in chunk:
            try:
                session.execute(ps, (
                    it["theme_id"],
                    it.get("title", ""),
                    it.get("question", ""),
                    it.get("solution", ""),
                    it.get("facts"),
                    it.get("tags"),
                    it.get("lang"),
                ))
                written += 1
            except Exception as exc:
                failed.append(it.get("theme_id", "?"))
                print(f"[ERROR] {it.get('theme_id','?')}: {exc}", file=sys.stderr)
    return written, failed

def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Bulk import/upsert themes from JSON into Cassandra")
    p.add_argument("input", help="Path to JSON or NDJSON. Accepts multi-item {\"items\": [...]} format.")
    p.add_argument("--autogen-prefix", default=None, help="If item has no id, generate as <prefix>-XXXXXXXX")
    p.add_argument("--lang", default=None, help="Default lang if missing (e.g., ja)")
    p.add_argument("--tag", dest="tags", action="append", default=[], help="Add a tag (repeatable). Merged with existing tags.")
    p.add_argument("--dry-run", action="store_true", help="Validate and show what would be written (no DB write).")
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--verbose", "-v", action="store_true")
    args = p.parse_args(argv)

    raw_items = load_input(args.input)
    normalized: List[Dict[str, Any]] = []
    for raw in raw_items:
        item = normalize_item(raw, autogen_prefix=args.autogen_prefix)
        if args.lang and not item.get("lang"):
            item["lang"] = args.lang
        if args.tags:
            merged = set(item.get("tags") or [])
            for t in args.tags:
                merged.add(t)
            item["tags"] = sorted(merged) if merged else None
        normalized.append(item)

    ids = [x["theme_id"] for x in normalized]
    dup = sorted({i for i in ids if ids.count(i) > 1})
    if dup:
        print(f"[WARN] duplicate ids (last write wins): {dup}", file=sys.stderr)

    written, failed = upsert_items(normalized, batch_size=args.batch_size, simulate=args.dry_run, verbose=args.verbose)

    # ALWAYS print a summary result to STDOUT
    print(json.dumps({
        "input_count": len(raw_items),
        "normalized_count": len(normalized),
        "written": written,
        "failed": failed,
        "dry_run": args.dry_run,
    }, ensure_ascii=False))

    return 0 if not failed else 2

if __name__ == "__main__":
    raise SystemExit(main())

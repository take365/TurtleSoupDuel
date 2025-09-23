#!/usr/bin/env python
"""Simple Cassandra connectivity check + dump some themes."""
import os
import sys
import json
from cassandra.cluster import Cluster
from cassandra.auth import PlainTextAuthProvider


def parse_contact_points(value: str):
    raw = [item.strip() for item in value.split(",") if item.strip()]
    hosts = []
    port = 9042
    for item in raw:
        if ":" in item:
            host, port_str = item.rsplit(":", 1)
            hosts.append(host)
            try:
                port = int(port_str)
            except ValueError:
                pass
        else:
            hosts.append(item)
    if not hosts:
        hosts = ["127.0.0.1"]
    return hosts, port


def main():
    contact_points = os.getenv("CASSANDRA_CONTACT_POINTS", "127.0.0.1:9042")
    hosts, port = parse_contact_points(contact_points)
    keyspace = os.getenv("CASSANDRA_KEYSPACE", "turtlesoup")
    dc = os.getenv("CASSANDRA_DC")
    user = os.getenv("CASSANDRA_USER")
    password = os.getenv("CASSANDRA_PASS")

    auth = PlainTextAuthProvider(username=user, password=password) if user and password else None

    try:
        cluster = Cluster(contact_points=hosts, port=port, auth_provider=auth)
        if dc:
            cluster = Cluster(contact_points=hosts, port=port, auth_provider=auth, load_balancing_policy=None)
        session = cluster.connect(keyspace)
    except Exception as exc:
        print(f"[ERROR] Unable to connect to Cassandra: {exc}", file=sys.stderr)
        sys.exit(1)

    try:
        # 新規登録した blog_qyuzu_umigame_collection.json を確認するので
        # theme_id が qyuzu- で始まるものをいくつか取得
        rows = session.execute(
            "SELECT theme_id, title, question, solution, tags, lang FROM themes_by_id LIMIT 50"
        )
        fetched = [row for row in rows if str(row.theme_id).startswith("qyuzu-")]
    except Exception as exc:
        print(f"[ERROR] Connected but query failed: {exc}", file=sys.stderr)
        session.shutdown()
        cluster.shutdown()
        sys.exit(1)

    session.shutdown()
    cluster.shutdown()

    print("[OK] Cassandra connection succeeded.")
    if not fetched:
        print("  (no qyuzu-* records found)")
        return

    for row in fetched[:10]:
        record = {
            "id": row.theme_id,
            "title": row.title,
            "question": row.question,
            "solution": row.solution,
            "tags": row.tags,
            "lang": row.lang,
        }
        print(json.dumps(record, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

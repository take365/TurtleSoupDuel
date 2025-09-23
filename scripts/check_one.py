import os
from cassandra.cluster import Cluster
from cassandra.auth import PlainTextAuthProvider

def parse_contact_points(value: str):
    raw = [item.strip() for item in value.split(",") if item.strip()]
    hosts, port = [], 9042
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
    return hosts or ["127.0.0.1"], port

def main(theme_id: str):
    contact_points = os.getenv("CASSANDRA_CONTACT_POINTS", "127.0.0.1:9042")
    hosts, port = parse_contact_points(contact_points)
    keyspace = os.getenv("CASSANDRA_KEYSPACE", "turtlesoup")
    user = os.getenv("CASSANDRA_USER")
    password = os.getenv("CASSANDRA_PASS")
    auth = PlainTextAuthProvider(username=user, password=password) if user and password else None
    cluster = Cluster(contact_points=hosts, port=port, auth_provider=auth)
    session = cluster.connect(keyspace)

    rows = session.execute(
        "SELECT theme_id, title, question, solution FROM themes_by_id WHERE theme_id=%s",
        (theme_id,),
    )
    for row in rows:
        print(f"id={row.theme_id}\n title={row.title}\n question={row.question}\n solution={row.solution}\n")

    session.shutdown()
    cluster.shutdown()

if __name__ == "__main__":
    import sys
    tid = sys.argv[1] if len(sys.argv) > 1 else "qyuzu-001"
    main(tid)

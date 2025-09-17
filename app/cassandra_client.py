import os
from functools import lru_cache
from typing import Tuple, List

from cassandra.cluster import Cluster
from cassandra.auth import PlainTextAuthProvider
from cassandra.policies import DCAwareRoundRobinPolicy


def _parse_contact_points(value: str) -> Tuple[List[str], int]:
    raw = (value or "127.0.0.1:9042").split(",")
    hosts: List[str] = []
    port = 9042
    for part in raw:
        part = part.strip()
        if not part:
            continue
        if ":" in part:
            host, p = part.rsplit(":", 1)
            try:
                port = int(p)
            except ValueError:
                port = 9042
            hosts.append(host)
        else:
            hosts.append(part)
    if not hosts:
        hosts = ["127.0.0.1"]
    return hosts, port


@lru_cache(maxsize=1)
def get_session():
    contact_points, port = _parse_contact_points(os.getenv("CASSANDRA_CONTACT_POINTS", "127.0.0.1:9042"))
    dc = os.getenv("CASSANDRA_DC", "dc1")
    keyspace = os.getenv("CASSANDRA_KEYSPACE", "turtlesoup")
    auth = None
    user = os.getenv("CASSANDRA_USER")
    password = os.getenv("CASSANDRA_PASS")
    if user and password:
        auth = PlainTextAuthProvider(username=user, password=password)

    cluster_kwargs = {
        "contact_points": contact_points,
        "port": port,
        "auth_provider": auth,
    }
    if dc:
        cluster_kwargs["load_balancing_policy"] = DCAwareRoundRobinPolicy(dc)

    cluster = Cluster(**cluster_kwargs)
    session = cluster.connect(keyspace)
    session.default_timeout = float(os.getenv("CASSANDRA_TIMEOUT", "5"))
    return session

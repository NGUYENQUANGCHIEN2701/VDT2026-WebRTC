from diagrams import Diagram, Cluster, Edge
from diagrams.onprem.client import Users
from diagrams.onprem.network import Nginx, Internet
from diagrams.onprem.database import PostgreSQL
from diagrams.onprem.inmemory import Redis
from diagrams.onprem.queue import RabbitMQ
from diagrams.onprem.monitoring import Prometheus, Grafana
from diagrams.programming.framework import Spring

graph_attr = {
    "dpi": "300",
    "fontsize": "22",
    "splines": "spline",
    "nodesep": "0.6",
    "ranksep": "0.9",
    "pad": "0.4",
}
node_attr = {
    "fontsize": "13",
}

with Diagram(
    "VDT WebRTC - Architecture",
    filename="vdt_webrtc_architecture",
    show=False,
    direction="TB",
    outformat=["png", "svg"],
    graph_attr=graph_attr,
    node_attr=node_attr,
):
    userA = Users("User A\n(browser)")
    userB = Users("User B\n(browser)")

    with Cluster("TURN fallback (chi dung khi P2P truc tiep that bai)"):
        turn = Internet("coturn\n(STUN/TURN)")

    lb = Nginx("nginx\n(LB + reverse proxy + SPA)")

    with Cluster("Signaling (Spring Boot)"):
        backends = [Spring("backend-1"), Spring("backend-2")]

    with Cluster("Data & Messaging"):
        db = PostgreSQL("postgres")
        redis = Redis("redis\n(pub/sub + presence)")
        mq = RabbitMQ("rabbitmq\n(call-history)")

    with Cluster("Observability"):
        prom = Prometheus("prometheus")
        graf = Grafana("grafana")

    userA >> Edge(label="WSS signaling + HTTPS REST") >> lb
    userB >> Edge(label="WSS signaling + HTTPS REST") >> lb
    lb >> backends
    userA >> Edge(label="P2P media (SRTP)", style="bold", color="green") >> userB
    userA >> Edge(label="TURN relay (fallback)", style="dashed") >> turn
    userB >> Edge(label="TURN relay (fallback)", style="dashed") >> turn

    for b in backends:
        b >> db
        b >> redis
        b >> mq
    redis >> Edge(label="cross-instance route", style="dashed") >> redis

    backends >> Edge(style="dotted") >> prom >> graf

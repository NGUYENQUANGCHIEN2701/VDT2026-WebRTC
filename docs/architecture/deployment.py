"""
Deployment topology: dev (docker-compose.yml, mot may local) vs prod
(docker-compose.yml + docker-compose.prod.yml override, AWS EC2).
Nguon: docker-compose.yml, docker-compose.prod.yml.
"""
from diagrams import Diagram, Cluster, Edge
from diagrams.onprem.network import Nginx
from diagrams.onprem.database import PostgreSQL
from diagrams.onprem.inmemory import Redis
from diagrams.onprem.queue import RabbitMQ
from diagrams.onprem.monitoring import Prometheus, Grafana
from diagrams.onprem.compute import Server
from diagrams.onprem.certificates import LetsEncrypt
from diagrams.programming.framework import Spring
from diagrams.generic.storage import Storage

graph_attr = {
    "dpi": "300",
    "fontsize": "22",
    "splines": "spline",
    "nodesep": "0.5",
    "ranksep": "0.8",
    "pad": "0.4",
}
node_attr = {"fontsize": "12"}
edge_attr = {"fontsize": "10"}


def stack(prefix):
    """Tao 1 bo service giong nhau, dat ten node duy nhat theo prefix (dev/prod)."""
    backends = [Spring(f"backend-1"), Spring(f"backend-2")]
    db = PostgreSQL("postgres:17\n:5432")
    redis = Redis("redis:7\n:6379")
    mq = RabbitMQ("rabbitmq:4.1\n:5672 / :15672")
    prom = Prometheus("prometheus\n:9090")
    graf = Grafana("grafana\n:3000")
    vol = Storage("pgdata\n(named volume)")
    for b in backends:
        b >> db
        b >> redis
        b >> mq
    db >> vol
    backends >> Edge(style="dotted") >> prom >> graf
    return backends


with Diagram(
    "VDT WebRTC - Deployment: Dev vs Prod",
    filename="deployment",
    show=False,
    direction="TB",
    outformat=["png", "svg"],
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
):
    with Cluster("DEV - 1 may local (docker compose up)"):
        nginx_dev = Nginx("nginx\nHTTP :8080 -> :80\n(default.conf bake trong image)")
        backends_dev = stack("dev")
        nginx_dev >> backends_dev

    with Cluster("PROD - AWS EC2 (+ docker-compose.prod.yml)"):
        certbot = LetsEncrypt("certbot\n(host process, ngoai Docker)")
        cert_vol = Storage("/etc/letsencrypt\n(host bind mount, ro)")
        nginx_prod = Nginx("nginx\nHTTPS :443 + :80->301\n(nginx/prod/vdt.conf override)")
        backends_prod = stack("prod")

        certbot >> Edge(label="renew") >> cert_vol
        cert_vol >> Edge(label="mount :ro") >> nginx_prod
        nginx_prod >> backends_prod

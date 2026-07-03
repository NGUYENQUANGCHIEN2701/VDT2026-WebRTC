"""
Zoom vao co che dinh tuyen cross-instance qua Redis (Phase 6) - phan duoc
danh gia la "con so hoc thuat gia tri nhat" trong spike MANIFEST.

Nguon: RedisMessageRouter.java, RoutingMessageListener.java, PresenceWebSocketHandler.java
- route:<username> -> instanceId, TTL 60s, refresh moi lan client gui {"type":"ping"}
- Redis pub/sub channel "inst:<instanceId>" mang RoutedEnvelope{userId, payload}

Luu y class boundary (de khong ve sai): logic routing (sessionRegistry.get,
GET route, PUBLISH) nam o RedisMessageRouter, KHONG phai PresenceWebSocketHandler.
Phia nhan la RoutingMessageListener - no lay thang WebSocketSession tu
SessionRegistry va goi session.sendMessage() TRUC TIEP, khong di qua
PresenceWebSocketHandler.
"""
from diagrams import Diagram, Cluster, Edge
from diagrams.onprem.client import Users
from diagrams.onprem.compute import Server
from diagrams.onprem.inmemory import Redis
from diagrams.programming.framework import Spring

graph_attr = {
    "dpi": "300",
    "fontsize": "22",
    "splines": "spline",
    "nodesep": "0.7",
    "ranksep": "1.0",
    "pad": "0.4",
}
node_attr = {"fontsize": "12"}
edge_attr = {"fontsize": "11"}

with Diagram(
    "VDT WebRTC - Redis Cross-Instance Routing",
    filename="redis_routing",
    show=False,
    direction="LR",
    outformat=["png", "svg"],
    graph_attr=graph_attr,
    node_attr=node_attr,
    edge_attr=edge_attr,
):
    userA = Users("User A\n(WS ket noi toi backend-1)")

    with Cluster("backend-1"):
        handler1 = Spring("PresenceWebSocketHandler\n(WS entrypoint)")
        router1 = Server("RedisMessageRouter\n(sendToUser)")
        reg1 = Server("SessionRegistry\n(local, in-memory)")

    redis = Redis("Redis")

    with Cluster("backend-2"):
        listener2 = Server("RoutingMessageListener\n(subscriber inst:backend-2)")
        reg2 = Server("SessionRegistry\n(local, in-memory)")
        handler2 = Spring("PresenceWebSocketHandler\n(WS entrypoint)")

    userB = Users("User B\n(WS ket noi toi backend-2)")

    # Thiet lap route luc connect + heartbeat giu song (PresenceWebSocketHandler lam,
    # KHONG phai RedisMessageRouter)
    userB >> Edge(label="connect", style="dashed", color="gray") >> handler2
    handler2 >> Edge(label="register(userB, session)", style="dashed", color="gray") >> reg2
    handler2 >> Edge(label="SET route:userB=backend-2 EX 60s", style="dashed", color="gray") >> redis
    userB >> Edge(label="ping <60s -> EXPIRE route:userB", style="dashed", color="gray") >> handler2

    # Luong gui tin thuc te: A goi B, session B khong nam tren backend-1
    userA >> Edge(label="1. sdp/ice-candidate/call-invite...", color="blue") >> handler1
    handler1 >> Edge(label="2. router.sendToUser(userB, msg)\n(truc tiep hoac qua CallService)", color="blue") >> router1
    router1 >> Edge(label="3. sessionRegistry.get(userB) -> MISS", color="blue") >> reg1
    router1 >> Edge(label="4. GET route:userB", color="blue") >> redis
    redis >> Edge(label='5. -> "backend-2"', color="blue") >> router1
    router1 >> Edge(label='6. PUBLISH inst:backend-2\n{userId, payload}', color="blue") >> redis
    redis >> Edge(label="7. onMessage (subscribed)", color="blue") >> listener2
    listener2 >> Edge(label="8. sessionRegistry.get(userB) -> HIT", color="blue") >> reg2
    listener2 >> Edge(label="9. session.sendMessage(payload)\n(truc tiep, KHONG qua PresenceWebSocketHandler)", color="blue") >> userB

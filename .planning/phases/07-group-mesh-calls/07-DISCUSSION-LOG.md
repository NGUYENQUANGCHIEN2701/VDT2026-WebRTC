# Phase 7: Group Mesh Calls - Discussion Log

> **Audit trail only.** Do not use as input to planning/research/execution — those read CONTEXT.md.

**Date:** 2026-06-29
**Phase:** 7-group-mesh-calls
**Areas discussed:** Room entry UX, 1-1 vs group, Room state + cap, Multi-party UI + drop + bitrate

---

## Room entry UX

| Option | Selected |
|--------|----------|
| Multi-invite (select online users → fan-out invite → join room) | ✓ |
| Create room + room code/link | |
| Escalate from 1-1 ("add person") | |

**Choice:** Multi-invite — reuses online-list + invite/accept; room still first-class server-side.

## 1-1 vs group

| Option | Selected |
|--------|----------|
| Separate parallel group flow, keep 1-1 untouched (reuse PeerManager + relay) | ✓ |
| Unify: 1-1 = room of 2 (refactor) | |
| You decide | |

**Choice:** Separate flow. Protects core value "1-1 must always work"; signaling already generic so minimal duplication.

## Room state + cap

| Option | Selected |
|--------|----------|
| Redis Lua script atomic cap (room:{id} SET, SCARD<4 → SADD) | ✓ |
| WATCH/MULTI optimistic | |
| You decide | |

**Choice:** Redis Lua atomic — race-free 5th rejection; the CAS Phase 6 deferred.

| Option | Selected |
|--------|----------|
| Server returns member-list on join (joiner-initiates) + broadcast join/left + room dies empty + TTL + userId politeness | ✓ |
| You decide | |

**Choice:** Joiner-initiates with server member-list; deterministic per-pair politeness via userId comparison.

## Multi-party UI + drop + bitrate

| Option | Selected |
|--------|----------|
| Even grid (2x2), per-tile per-peer status (= partial-failure surface) | ✓ |
| Active-speaker (big + thumbnails) | |
| Defer to UI-SPEC | |

**Choice:** Even 2x2 grid; per-tile connection state surfaces partial-mesh failure.

| Option | Selected |
|--------|----------|
| Dynamic per-sender bitrate cap when ≥3 (setParameters) | ✓ |
| Static always-on cap | |
| You decide | |

**Choice:** Dynamic per-sender maxBitrate when ≥3 participants; value (~300-500kbps) for researcher; verifiable in DebugPanel.

---

## Claude's Discretion
- Room id scheme, Redis key layout, Lua script text, new room/signaling message records, Map<userId,PeerManager> wiring (decouple PeerManager from global callStore), bitrate ladder values, mesh reconnect.

## Deferred Ideas
- SFU >4 (ADV-04), group recording (ADV-05), group screen share (Phase 8), mid-1-1 escalation, room-code join, active-speaker layout, host/kick controls.

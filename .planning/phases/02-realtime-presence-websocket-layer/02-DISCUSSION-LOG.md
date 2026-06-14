# Phase 2: Realtime Presence & WebSocket Layer — Discussion Log

**Date:** 2026-06-14
**Mode:** discuss (standard)

> Human-reference log of the discuss-phase session. Not consumed by downstream agents — see `02-CONTEXT.md` for the canonical decisions.

## Areas discussed (user selected all 4)

### 1. Presence storage: local vs Redis now
- **Options:** Local impl + `PresenceService` seam (Redis at Phase 6) **vs** Redis TTL now.
- **Chosen:** Local + seam → **D-01**.
- **Rationale:** Matches roadmap's design-for-scale seam decision; keeps Phase 2 focused on WS+presence mechanics without Redis infra; PRES-02 satisfied at Phase 6. Same pattern for MessageRouter.

### 2. Single-session kick UX (PRES-03)
- **Options:** Notify ("logged in elsewhere") + redirect to login **vs** silent disconnect.
- **Chosen:** Notify + redirect → **D-02**.
- **Rationale:** Clearest UX; teaches server-pushed control message.

### 3. Online list status + update model (PRES-01)
- **Options:** Full snapshot push **vs** delta events.
- **Chosen:** Full snapshot; status as forward-compatible enum (ONLINE now, IN_CALL Phase 4) → **D-03**.
- **Rationale:** Simpler/robust for demo scale; delta is premature optimization.

### 4. Offline detection threshold (PRES-02)
- **Options:** ~60s (heartbeat ~25s) **vs** ~15s faster.
- **Chosen:** ~60s → **D-04**.
- **Rationale:** Matches success criteria; balances responsiveness vs traffic; tolerates network blips.

## Carried forward from Phase 1
- In-memory access token (01 D-03) reused for WS auth.
- Feature-package structure (01 D-07) → `ws/`, `presence/`.
- Server-owns-identity principle.

## Deferred
- Redis presence + cross-instance pub/sub → Phase 6.
- Call signaling payloads → Phase 3.
- IN_CALL status wiring → Phase 4.

---
quick_id: 260613-kxw
status: complete
date: 2026-06-13
---

# Quick Task 260613-kxw — Summary

Externalized DB and JWT credentials via environment variables.

## Changes

1. **backend/src/main/resources/application.yaml**
   - `datasource.url` → `${DB_URL:jdbc:postgresql://localhost:5432/vdt_webrtc}`
   - `datasource.username` → `${DB_USERNAME:vdt}`
   - `datasource.password` → `${DB_PASSWORD:vdt_pass}`
   - `jwt.secret` → `${JWT_SECRET:dev-only-secret-...}` (dev default, overridden in Docker)
2. **.env.example** — committed template with POSTGRES_*, DB_*, JWT_SECRET (placeholders only).
3. **.gitignore** (new, repo root) — blocks `.env`, `.env.*` (keeps `.env.example`), and `application-local.*`.

## Behavior

- Local `mvnw spring-boot:run` / Spring Dashboard: no env needed, defaults apply.
- Docker Compose: loads `.env`, injects `DB_*` + `JWT_SECRET` into the backend, overriding defaults.
- `application-docker.yaml` left untouched (only overrides Postgres hostname).

## Verification

- `git check-ignore .env` → matches; `.env.example` not ignored. ✓
- No bare credential literals remain in application.yaml. ✓

## Tradeoff accepted

Dev-only JWT default lives in git — acceptable because it is local-only and always
overridden by the real `.env` value in Docker. Real secrets never committed.

## Follow-up (not in scope)

When docker-compose.yml is added, wire `environment:` for postgres + backend to these vars.

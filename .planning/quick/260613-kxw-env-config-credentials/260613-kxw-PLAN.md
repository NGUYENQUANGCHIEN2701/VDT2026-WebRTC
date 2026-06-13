---
quick_id: 260613-kxw
description: Move credentials in application.yaml to ${VAR:default} form, add .env.example and .gitignore
date: 2026-06-13
mode: quick
---

# Quick Task 260613-kxw: Externalize credentials via env vars

## Goal

Make DB and JWT credentials configurable through environment variables (12-factor),
so Docker injects real values from `.env` while local `mvnw spring-boot:run` / Spring
Dashboard runs work out-of-the-box from defaults. No real secret committed to git.

## Decisions (locked from discussion)

- DB credentials use `${VAR:default}` — defaults point at local Postgres (dev convenience).
- `jwt.secret` uses `${JWT_SECRET:<dev-only-default>}` — dev default tolerated because it is
  local-only and always overridden by `.env` in Docker. The real secret lives only in `.env`.
- `application-docker.yaml` stays as-is (only overrides hostname `postgres`).
- `.env` holds real values for Docker Compose; `.env.example` is the committed template.
- Root `.gitignore` blocks `.env` (and `application-local.yaml`).

## Tasks

### Task 1 — Externalize credentials in application.yaml
- **files:** backend/src/main/resources/application.yaml
- **action:** Replace hardcoded datasource username/password and add url/JWT env placeholders with defaults.
- **verify:** yaml uses `${DB_URL:...}`, `${DB_USERNAME:vdt}`, `${DB_PASSWORD:vdt_pass}`, `${JWT_SECRET:...}`.
- **done:** No bare credential literals remain; app still boots with no env set.

### Task 2 — Add .env.example template
- **files:** .env.example
- **action:** Create template with POSTGRES_* and JWT_SECRET keys (placeholder values, no real secrets).
- **verify:** File lists every var the Compose stack will inject.
- **done:** A new dev can `cp .env.example .env` and fill values.

### Task 3 — Add root .gitignore blocking .env
- **files:** .gitignore
- **action:** Create root .gitignore ignoring `.env`, `.env.*` (keep `.env.example`), `application-local.yaml`.
- **verify:** `git check-ignore .env` matches; `.env.example` not ignored.
- **done:** Real secrets cannot be accidentally committed.

## must_haves

- truths: DB+JWT creds read from env with safe local defaults; real secrets only in gitignored .env
- artifacts: application.yaml (env placeholders), .env.example, .gitignore
- key_links: backend/src/main/resources/application.yaml, .env.example, .gitignore

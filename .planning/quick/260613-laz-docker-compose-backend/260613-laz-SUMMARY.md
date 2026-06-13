---
quick_id: 260613-laz
status: complete
date: 2026-06-13
---

# Quick Task 260613-laz — Summary

Added Docker Compose stack (postgres + backend) so the app runs via `docker compose up --build`.

## Changes

1. **backend/Dockerfile** — multi-stage: `maven:3.9-eclipse-temurin-21` build (with dependency caching, `-DskipTests`) → `eclipse-temurin:21-jre-alpine` run, non-root user, `java -jar app.jar` on 8080.
2. **backend/.dockerignore** — excludes target/, wrapper jar, IDE files from build context.
3. **docker-compose.yml** (repo root) — postgres + backend wired to `.env`:
   - postgres: `postgres:17-alpine`, host **5433**→container 5432 (avoids clash with local Postgres), `pg_isready` healthcheck, `pgdata` volume.
   - backend: built from ./backend, `DB_URL/DB_USERNAME/DB_PASSWORD/JWT_SECRET` from `.env`, `/actuator/health` healthcheck, `depends_on: postgres service_healthy`, port 8080.

## Verification

- `docker compose config` resolves all vars from `.env` with no errors. ✓ (user=root, db=vdt_webrtc, JWT present)
- Build not run here (Docker daemon was down); first `docker compose up --build` will compile + migrate.

## How to run

1. Start Docker Desktop.
2. `docker compose up --build`
3. Backend on http://localhost:8080 ; Flyway auto-creates tables. Postgres reachable from host on 5433.

## Scope / deferred

Minimal to current deps (only Postgres). redis/rabbitmq/frontend/nginx LB + backend x2 scale-out
are added in their respective later phases — not included now to avoid dead services.

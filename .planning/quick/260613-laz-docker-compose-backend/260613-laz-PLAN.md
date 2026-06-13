---
quick_id: 260613-laz
description: Create docker-compose.yml (postgres+backend) and backend Dockerfile
date: 2026-06-13
mode: quick
---

# Quick Task 260613-laz: Docker Compose (postgres + backend)

## Goal

Let the full stack run with `docker compose up --build`, reading credentials from `.env`.
Minimal scope matching current deps: only Postgres + backend (Boot 4.0.7 / Java 21).
Redis/RabbitMQ/frontend/LB are deferred to the phases that introduce them.

## Decisions

- Backend image: multi-stage Dockerfile (maven:3.9-eclipse-temurin-21 build → eclipse-temurin:21-jre-alpine run).
- Credentials injected via env from `.env` (DB_URL/DB_USERNAME/DB_PASSWORD/JWT_SECRET) — env overrides yaml defaults; no reliance on the `docker` profile.
- Postgres published on host **5433** (container 5432) to avoid clashing with the dev's local Postgres on 5432. Backend reaches Postgres internally on 5432 via the compose network.
- Healthchecks: postgres `pg_isready`; backend `/actuator/health` (actuator present). `depends_on: service_healthy` gates backend start.
- Named volume `pgdata` for persistence.

## Tasks

### Task 1 — backend Dockerfile + .dockerignore
- files: backend/Dockerfile, backend/.dockerignore
- action: Multi-stage build; ignore target/ and wrapper jar.
- verify: References jar produced by `mvn package`; final image is JRE alpine running as non-root.
- done: `docker compose build backend` would produce a runnable image.

### Task 2 — docker-compose.yml
- files: docker-compose.yml
- action: postgres + backend services wired to .env, healthchecks, depends_on, pgdata volume, host port 5433 for postgres.
- verify: `docker compose config` resolves vars from .env without errors.
- done: `docker compose up --build` brings up Postgres then backend; Flyway migrates.

## must_haves
- truths: full stack runnable via Docker from .env; no port clash with local Postgres
- artifacts: docker-compose.yml, backend/Dockerfile, backend/.dockerignore
- key_links: docker-compose.yml, backend/Dockerfile, .env.example

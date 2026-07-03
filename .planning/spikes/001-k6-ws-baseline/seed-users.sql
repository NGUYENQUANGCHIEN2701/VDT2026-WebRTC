-- Seed test users directly (bypasses /api/auth/register, which is rate-limited
-- to 5 req/15min/IP -- see MANIFEST.md Requirements). email_verified defaults to
-- TRUE (V5 migration), so these users can log in immediately, no OTP needed.
--
-- Run: docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
--        -f /dev/stdin < .planning/spikes/001-k6-ws-baseline/seed-users.sql

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (username, email, password_hash, role, locked)
SELECT
    'k6user' || gs,
    'k6user' || gs || '@k6.local',
    crypt('K6Test#2026', gen_salt('bf', 10)),
    'USER',
    FALSE
FROM generate_series(1, 200) AS gs
ON CONFLICT (username) DO NOTHING;

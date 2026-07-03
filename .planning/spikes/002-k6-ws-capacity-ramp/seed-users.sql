-- Extends spike 001's seed to 5000 users (2500 pairs -> up to 5000 concurrent
-- WS connections for the highest ramp step). Idempotent: existing k6user1..200
-- rows from spike 001 are left untouched.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (username, email, password_hash, role, locked)
SELECT
    'k6user' || gs,
    'k6user' || gs || '@k6.local',
    crypt('K6Test#2026', gen_salt('bf', 10)),
    'USER',
    FALSE
FROM generate_series(1, 5000) AS gs
ON CONFLICT (username) DO NOTHING;

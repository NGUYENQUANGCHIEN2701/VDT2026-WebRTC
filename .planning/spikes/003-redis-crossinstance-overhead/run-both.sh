#!/bin/sh
# Runs the same-instance vs cross-instance comparison. Requires the full
# compose stack up (postgres, redis, rabbitmq, backend-1, backend-2) and the
# 5000 test users already seeded (spike 002's seed-users.sql). Stays at 100
# pairs = 100 connections/instance in cross-instance mode -- well under the
# ~500-1000 breaking point found in spike 002.
#
# Usage (from repo root): sh .planning/spikes/003-redis-crossinstance-overhead/run-both.sh

set -eu
DIR=".planning/spikes/003-redis-crossinstance-overhead"
NET="vdt2026-webrtc_default"

echo "=================================================================="
echo " SAME-INSTANCE (both caller and callee on backend-1)"
echo "=================================================================="
MSYS_NO_PATHCONV=1 docker run --rm -i --network "$NET" \
    -e CALLER_HOST=backend-1:8080 -e CALLEE_HOST=backend-1:8080 \
    -e PAIRS=100 -e CYCLES=20 -e COOLDOWN_MS=200 \
    -v "$(pwd)/$DIR:/spike" \
    grafana/k6 run --summary-export="/spike/summary-same-instance.json" /spike/call-latency.js

echo ""
echo "=================================================================="
echo " CROSS-INSTANCE (caller on backend-1, callee on backend-2)"
echo "=================================================================="
MSYS_NO_PATHCONV=1 docker run --rm -i --network "$NET" \
    -e CALLER_HOST=backend-1:8080 -e CALLEE_HOST=backend-2:8080 \
    -e PAIRS=100 -e CYCLES=20 -e COOLDOWN_MS=200 \
    -v "$(pwd)/$DIR:/spike" \
    grafana/k6 run --summary-export="/spike/summary-cross-instance.json" /spike/call-latency.js

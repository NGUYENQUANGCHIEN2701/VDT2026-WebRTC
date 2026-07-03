#!/bin/sh
# Runs the capacity ramp: discrete concurrency steps (not a continuous k6
# ramping-vus stage, so each step gets a clean, independently-readable report
# and Prometheus snapshot). Requires: postgres/redis/rabbitmq/backend-1
# up (docker-compose.override.yml in spike 001), 5000 users seeded
# (seed-users.sql in this folder), Prometheus up (docker-compose.yml default).
#
# Usage (from repo root): sh .planning/spikes/002b-virtual-threads-ramp/run-ramp.sh
# Same ramp as spike 002, but against a backend-1 recreated with
# SPRING_THREADS_VIRTUAL_ENABLED=true (see docker-compose.override.yml here),
# to directly compare the breaking point with/without virtual threads.

set -eu
DIR=".planning/spikes/002b-virtual-threads-ramp"
NET="vdt2026-webrtc_default"
PROM="http://localhost:9090"

prom_query() {
    curl -s "$PROM/api/v1/query" --data-urlencode "query=$1" | \
        grep -o '"value":\[[^]]*\]' || true
}

snapshot() {
    label="$1"
    echo "--- Prometheus snapshot ($label) ---"
    echo "vdt_ws_sessions_active{backend-1}: $(prom_query 'vdt_ws_sessions_active{exported_instance="backend-1"}')"
    echo "vdt_calls_active{1-1,backend-1}:   $(prom_query 'vdt_calls_active{exported_instance="backend-1",call_type="1-1"}')"
    echo "process_cpu_usage{backend-1}:      $(prom_query 'process_cpu_usage{exported_instance="backend-1"}')"
    echo "jvm_heap_used{backend-1}:          $(prom_query 'jvm_memory_used_bytes{exported_instance="backend-1",area="heap"}')"
    echo "calls_ended_busy_total{backend-1}: $(prom_query 'vdt_calls_ended_total{exported_instance="backend-1",end_reason="busy"}')"
    echo "jvm_threads_live{backend-1}:       $(prom_query 'jvm_threads_live_threads{exported_instance="backend-1"}')"
    echo "jvm_threads_peak{backend-1}:       $(prom_query 'jvm_threads_peak_threads{exported_instance="backend-1"}')"
}

for PAIRS in 50 250 500 1000 2000; do
    CONN=$((PAIRS * 2))
    echo ""
    echo "=================================================================="
    echo " STEP: $CONN concurrent connections ($PAIRS pairs)"
    echo "=================================================================="
    snapshot "before"

    MSYS_NO_PATHCONV=1 docker run --rm -i --network "$NET" \
        -e BASE_HTTP=http://backend-1:8080 -e BASE_WS=ws://backend-1:8080 \
        -e PAIRS="$PAIRS" -e CYCLES=5 -e COOLDOWN_MS=200 \
        -v "$(pwd)/$DIR:/spike" \
        grafana/k6 run --summary-export="/spike/summary-${CONN}conn.json" /spike/call-latency.js \
        2>&1 | tail -35

    snapshot "after"
done

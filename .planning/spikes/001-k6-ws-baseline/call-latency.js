// Spike 001: baseline WebSocket signaling round-trip latency.
//
// Pairs VU (2k-1) as caller with VU (2k) as callee. Each pair repeats the real
// call-setup flow CYCLES times over a single persistent WS connection:
//   call-invite -> call-state-changed{ringing} -> call-accept
//     -> call-state-changed{active}  <-- RTT measured here (caller side)
//     -> hang-up -> call-state-changed{ended}
//
// This is the actual signaling path (PresenceWebSocketHandler -> CallService
// -> router.sendToUser), not a ping/pong heartbeat -- see MANIFEST.md.
//
// Run (from repo root), single backend instance exposed on :8081 (see
// docker-compose.override.yml in this folder):
//   docker run --rm -i --network host \
//     -e BASE_HTTP=http://localhost:8081 -e BASE_WS=ws://localhost:8081 \
//     -v "$(pwd)/.planning/spikes/001-k6-ws-baseline:/spike" \
//     grafana/k6 run /spike/call-latency.js

import ws from 'k6/ws';
import http from 'k6/http';
import { Trend, Counter } from 'k6/metrics';
import { check } from 'k6';

const BASE_HTTP = __ENV.BASE_HTTP || 'http://localhost:8081';
const BASE_WS = __ENV.BASE_WS || 'ws://localhost:8081';
const PAIRS = parseInt(__ENV.PAIRS || '50', 10); // 50 pairs = 100 VUs = 100 seeded users
const CYCLES = parseInt(__ENV.CYCLES || '10', 10); // call cycles per pair
const COOLDOWN_MS = parseInt(__ENV.COOLDOWN_MS || '200', 10); // gap between hang-up and next invite
const PASSWORD = 'K6Test#2026';

const callRtt = new Trend('call_setup_rtt_ms', true);
const callsCompleted = new Counter('calls_completed');
const callsFailed = new Counter('calls_failed');

export const options = {
    scenarios: {
        calls: {
            executor: 'per-vu-iterations',
            vus: PAIRS * 2,
            iterations: 1,
            maxDuration: '3m',
        },
    },
    thresholds: {
        calls_failed: ['count==0'],
    },
};

function login(username) {
    const res = http.post(
        `${BASE_HTTP}/api/auth/login`,
        JSON.stringify({ username, password: PASSWORD }),
        { headers: { 'Content-Type': 'application/json' } }
    );
    check(res, { 'login 200': (r) => r.status === 200 });
    return res.json('token');
}

export default function () {
    const vu = __VU; // 1-based, stable for the whole run (per-vu-iterations)
    const isCaller = vu % 2 === 1;
    const username = `k6user${vu}`;
    const calleeUsername = isCaller ? `k6user${vu + 1}` : null;

    const token = login(username);
    if (!token) {
        callsFailed.add(1);
        return;
    }

    const url = `${BASE_WS}/ws?token=${token}`;
    let cyclesDone = 0;
    let inviteSentAt = 0;
    let currentCallId = null;

    ws.connect(url, {}, (socket) => {
        socket.on('open', () => {
            // Give both sides of the pair time to finish the handshake and
            // register presence before the first invite goes out.
            socket.setTimeout(() => startCycle(socket), 1000);
            // Real clients heartbeat to keep route:<username> alive in Redis
            // (60s TTL, refreshed only on 'ping' -- see PresenceWebSocketHandler).
            // Without this, long-running VUs go silently unroutable mid-test.
            socket.setInterval(() => socket.send(JSON.stringify({ type: 'ping' })), 15000);
        });

        function startCycle(socket) {
            if (cyclesDone >= CYCLES) {
                socket.close();
                return;
            }
            if (isCaller) {
                inviteSentAt = Date.now();
                socket.send(JSON.stringify({ type: 'call-invite', to: calleeUsername }));
            }
            // Callee just waits for the incoming 'ringing' event in on('message').
            // Safety net: if nothing happens within 8s, bail this cycle.
            socket.setTimeout(() => {
                if (cyclesDone < CYCLES) {
                    callsFailed.add(1);
                    cyclesDone++;
                    startCycle(socket);
                }
            }, 8000);
        }

        socket.on('message', (data) => {
            let msg;
            try {
                msg = JSON.parse(data);
            } catch (e) {
                return;
            }

            if (msg.type === 'call-state-changed') {
                if (msg.state === 'ringing') {
                    currentCallId = msg.callId;
                    if (!isCaller) {
                        // Callee accepts immediately.
                        socket.send(JSON.stringify({ to: msg.callerId, callId: msg.callId, type: 'call-accept' }));
                    }
                } else if (msg.state === 'active') {
                    if (isCaller) {
                        const rtt = Date.now() - inviteSentAt;
                        callRtt.add(rtt);
                        callsCompleted.add(1);
                        socket.send(JSON.stringify({ type: 'hang-up', callId: msg.callId }));
                    }
                } else if (msg.state === 'ended') {
                    cyclesDone++;
                    socket.setTimeout(() => startCycle(socket), COOLDOWN_MS);
                }
            }
        });

        socket.on('error', (e) => {
            callsFailed.add(1);
        });

        // Absolute safety valve so a stuck pair doesn't hang the whole VU.
        socket.setTimeout(() => socket.close(), (CYCLES + 1) * 10000);
    });
}

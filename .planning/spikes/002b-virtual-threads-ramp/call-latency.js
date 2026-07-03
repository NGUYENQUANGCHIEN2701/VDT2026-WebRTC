// Spike 002: capacity ramp -- find the breaking point of concurrent 1-1 call
// signaling on a single backend instance. Same real call flow as spike 001
// (call-invite -> ringing -> call-accept -> active -> hang-up -> ended),
// heartbeat included (see CONVENTIONS.md -- mandatory, or route:<username>
// expires in Redis and results are meaningless).
//
// Unlike spike 001 (one fixed-size run), this script is invoked once per
// discrete concurrency step (100/500/1000/2000/4000 connections) by
// run-ramp.sh, which also snapshots Prometheus metrics (vdt_ws_sessions_active,
// vdt_calls_ended_total, jvm/cpu) around each step.
//
// Run: see run-ramp.sh in this folder.

import ws from 'k6/ws';
import http from 'k6/http';
import { Trend, Counter } from 'k6/metrics';
import { check } from 'k6';

const BASE_HTTP = __ENV.BASE_HTTP || 'http://localhost:8081';
const BASE_WS = __ENV.BASE_WS || 'ws://localhost:8081';
const PAIRS = parseInt(__ENV.PAIRS || '50', 10);
const CYCLES = parseInt(__ENV.CYCLES || '5', 10);
const COOLDOWN_MS = parseInt(__ENV.COOLDOWN_MS || '200', 10);
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
            maxDuration: '5m',
        },
    },
    // No hard threshold here (unlike spike 001) -- the whole point of this
    // spike is to find the concurrency where calls_failed > 0, not to fail
    // the run when it happens.
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
    const vu = __VU;
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

    ws.connect(url, {}, (socket) => {
        socket.on('open', () => {
            socket.setTimeout(() => startCycle(socket), 1000);
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
                    if (!isCaller) {
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

        socket.on('error', () => {
            callsFailed.add(1);
        });

        socket.setTimeout(() => socket.close(), (CYCLES + 1) * 10000);
    });
}

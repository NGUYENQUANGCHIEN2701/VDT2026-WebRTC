// Spike 003: Redis cross-instance routing overhead.
//
// Same real call flow as spikes 001/002 (call-invite -> ringing -> call-accept
// -> active -> hang-up -> ended), heartbeat included. The difference: caller
// and callee can be pointed at DIFFERENT backend instances via CALLER_HOST /
// CALLEE_HOST, bypassing nginx's round-robin (non-deterministic) so we can
// deterministically compare:
//   - same-instance:  CALLER_HOST=CALLEE_HOST=backend-1:8080
//   - cross-instance: CALLER_HOST=backend-1:8080, CALLEE_HOST=backend-2:8080
// JWT is stateless (shared JWT_SECRET across instances -- see docker-compose.yml),
// so a token from either instance's /api/auth/login works against both.
//
// Kept well under the spike-002 breaking point (~500-1000 connections/instance)
// -- see run-both.sh (100 pairs = 100 connections/instance in cross-instance mode).
//
// Run: see run-both.sh in this folder.

import ws from 'k6/ws';
import http from 'k6/http';
import { Trend, Counter } from 'k6/metrics';
import { check } from 'k6';

const CALLER_HOST = __ENV.CALLER_HOST || 'backend-1:8080';
const CALLEE_HOST = __ENV.CALLEE_HOST || 'backend-1:8080';
const PAIRS = parseInt(__ENV.PAIRS || '100', 10);
const CYCLES = parseInt(__ENV.CYCLES || '20', 10);
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
};

function login(host, username) {
    const res = http.post(
        `http://${host}/api/auth/login`,
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
    const host = isCaller ? CALLER_HOST : CALLEE_HOST;

    const token = login(host, username);
    if (!token) {
        callsFailed.add(1);
        return;
    }

    const url = `ws://${host}/ws?token=${token}`;
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

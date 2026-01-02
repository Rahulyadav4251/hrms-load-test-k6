// modules/user/98vulogin.js
import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { USERS } from '../../data/admin_users.js';
import { getToken } from '../../lib/auth.js';
import { BASE_URL } from '../../config/env.js';
import http from 'k6/http';
import { sleep, check } from 'k6';
import { logJson } from '../../lib/logger.js';

// Scenario options
export const options = {
    scenarios: {
        login_once_and_run: {
            executor: 'per-vu-iterations',
            vus: USERS.length,
            iterations: 1,
            maxDuration: '5m',
        },
    },
};

// Setup function returns user list
export function setup() {
    return USERS;
}

export function runGetAllUsers(token) {
    const headers = {
        Authorization: token,
        'Content-Type': 'application/json',
    };

    // --- Step 1: GET all users 5 times ---
    for (let i = 1; i <= 5; i++) {
        const res = http.get(`${BASE_URL}/v1/user/get-all`, { headers });

        const ok = check(res, {
            'get-all users status 200': r => r.status === 200,
        });

        if (!ok) {
            logJson('GET_ALL_USERS_FAILED', {
                vu: __VU,
                iteration: __ITER,
                attempt: i,
                status: res.status,
                duration_ms: res.timings.duration,
                endpoint: '/v1/user/get-all',
                response: res.body?.slice(0, 500),
            });
        }

        sleep(1);
    }

    // --- Step 2: GET biometric attendance ---
    const biometricRes = http.get(
        `${BASE_URL}/v1/attendance-management/biometric/get-all`,
        { headers }
    );

    const biometricOk = check(biometricRes, {
        'get-all biometric status 200': r => r.status === 200,
    });

    if (!biometricOk) {
        logJson('GET_BIOMETRIC_FAILED', {
            vu: __VU,
            iteration: __ITER,
            status: biometricRes.status,
            duration_ms: biometricRes.timings.duration,
            endpoint: '/v1/attendance-management/biometric/get-all',
            response: biometricRes.body?.slice(0, 500),
        });
    }

    sleep(1);
}

// default function executed by each VU
export default function (data) {

    const user = data[__VU - 1];
    if (!user) return;

    const result = getToken(BASE_URL, user.username, user.password);
    if (!result.success) return;

    runGetAllUsers(result.token);
}

// handleSummary writes results, k6 will create intermediate folders automatically
export function handleSummary(data) {
    return {
        [`results/user/98vulogin/summary.json`]: JSON.stringify(data, null, 2),
        [`results/user/98vulogin/report.html`]: htmlReport(data),
        stdout: textSummary(data),
    };
}

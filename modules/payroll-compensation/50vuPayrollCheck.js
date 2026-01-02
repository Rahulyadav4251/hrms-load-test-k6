// modules/payroll/50vuPayrollCheck.js
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
        payroll_check: {
            executor: 'per-vu-iterations',
            vus: 50,
            iterations: 1,
            maxDuration: '5m',
        },
    },
};

// Setup function returns first 50 admin users
export function setup() {
    return USERS.slice(0, 50);
}

// Function to hit all payroll endpoints
export function runPayrollChecks(token) {
    const headers = {
        Authorization: token,
        'Content-Type': 'application/json',
    };

    const endpoints = [
        '/v1/payroll-compensation/payroll-head-configuration/get-all',
        '/v1/payroll-compensation/salary-structures/get-all',
        '/v1/payroll-compensation/slab-directory/get-all',
    ];

    endpoints.forEach((endpoint) => {
        const res = http.get(`${BASE_URL}${endpoint}`, { headers });

        const ok = check(res, {
            [`${endpoint} status 200`]: r => r.status === 200,
        });

        if (!ok) {
            logJson('PAYROLL_CHECK_FAILED', {
                vu: __VU,
                iteration: __ITER,
                endpoint,
                status: res.status,
                duration_ms: res.timings.duration,
                response: res.body?.slice(0, 500),
            });
        }

        sleep(1); // small pause between calls
    });
}

// Default function executed by each VU
export default function (data) {

    const user = data[__VU - 1];
    if (!user) return;

    const result = getToken(BASE_URL, user.username, user.password);
    if (!result.success) return;

    runPayrollChecks(result.token);
}

// handleSummary writes results, k6 will create folders automatically
export function handleSummary(data) {
    return {
        [`results/payroll-compensation/50vuPayrollCheck/summary.json`]: JSON.stringify(data, null, 2),
        [`results/payroll-compensation/50vuPayrollCheck/report.html`]: htmlReport(data),
        stdout: textSummary(data),
    };
}

import { htmlReport } from 'https://raw.githubusercontent.com/benc-uk/k6-reporter/main/dist/bundle.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.1/index.js';
import { USERS } from '../../data/admin_users.js';
import { getToken } from '../../lib/auth.js';
import { BASE_URL } from '../../config/env.js';
import http from 'k6/http';
import { sleep, check } from 'k6';
import { logJson } from '../../lib/logger.js';

// Multiple scenarios in one file
export const options = {
    scenarios: {
        // Scenario 1: Realistic morning check-in
        realistic_morning: {
            executor: 'per-vu-iterations',
            vus: USERS.length,
            iterations: 1,
            maxDuration: '5m',
            startTime: '0s',
        },
        
        // Scenario 2: Spike test - all at once
        spike_test: {
            executor: 'shared-iterations',
            vus: USERS.length,
            iterations: USERS.length,
            maxDuration: '2m',
            startTime: '10s',
        },
        
        // Scenario 3: High load (simulate 1000 users)
        high_load: {
            executor: 'constant-vus',
            vus: 1000,
            duration: '30s',
            startTime: '40s',
        },
    },
};

// Setup function
export function setup() {
    const userData = USERS.map((user, index) => ({
        username: user.username,
        password: user.password,
        employee_fid: 70 + index,
        device_user_id: "1",
    }));
    
    console.log(`Setup: Prepared ${userData.length} users for 3 scenarios`);
    return userData;
}

// Generate time based on scenario
function generateTime(isSpike = false) {
    const now = new Date();
    if (isSpike) return now.toISOString();
    
    // For realistic: 8:45-9:15 AM window
    const baseTime = new Date(now);
    baseTime.setHours(9, 0, 0, 0);
    const randomMinutes = Math.floor(Math.random() * 31) - 15;
    return new Date(baseTime.getTime() + randomMinutes * 60000).toISOString();
}

// Generate payload
function generatePayload(userData, scenario) {
    const isSpike = scenario === 'spike_test' || scenario === 'high_load';
    const time = generateTime(isSpike);
    const dateObj = new Date(time);
    
    return {
        employee_fid: scenario === 'high_load' ? (70 + (__VU % 1000)) : userData.employee_fid,
        device_user_id: "1",
        date: time,
        hours: dateObj.getHours(),
        minutes: dateObj.getMinutes(),
        in_out_flag: isSpike ? (Math.random() > 0.5 ? "IN" : "OUT") : "IN",
        hardware_type: "BIOMETRIC",
        is_lock: false,
        seconds: 0,
        milliseconds: 0
    };
}

// Submit function
function submitAttendance(token, payload, scenario) {
    const headers = {
        Authorization: token,
        'Content-Type': 'application/json',
    };

    const res = http.post(
        `${BASE_URL}/v1/attendance-management/biometric/create`,
        JSON.stringify(payload),
        { headers }
    );

    const ok = check(res, {
        [`${scenario} - status 201`]: r => r.status === 201,
        [`${scenario} - valid response`]: r => {
            try {
                const response = JSON.parse(r.body);
                return response.status === true && response.data?.id !== undefined;
            } catch {
                return false;
            }
        }
    });

    if (!ok) {
        logJson('ATTENDANCE_FAILED', {
            vu: __VU,
            scenario: scenario,
            endpoint: '/v1/attendance-management/biometric/create',
            status: res.status,
            duration_ms: res.timings.duration,
        });
    }

    return ok;
}

// Main function
export default function (data) {
    const scenario = __ENV ? __ENV.scenario : 'unknown';
    
    let userData;
    if (scenario === 'high_load') {
        // For high load: reuse credentials for simulated 1000 users
        const authIndex = __VU % data.length;
        userData = {
            ...data[authIndex],
            employee_fid: 70 + (__VU % 1000)
        };
    } else {
        // For other scenarios: use actual mapping
        const userIndex = (__VU - 1) % data.length;
        userData = data[userIndex];
    }
    
    if (!userData) return;
    
    const result = getToken(BASE_URL, userData.username, userData.password);
    if (!result.success) return;
    
    const payload = generatePayload(userData, scenario);
    
    // Submit attendance
    const success = submitAttendance(result.token, payload, scenario);
    
    if (success) {
        // Different delays based on scenario
        if (scenario === 'realistic_morning') {
            sleep(Math.random() * 2 + 1);
        } else if (scenario === 'spike_test') {
            sleep(0.1);
        } else {
            sleep(Math.random() * 0.5);
        }
    }
}

// Summary
export function handleSummary(data) {
    return {
        ['results/attendance_leave_management/summary.json']: JSON.stringify(data, null, 2),
        ['results/attendance_leave_management/report.html']: htmlReport(data),
        stdout: textSummary(data),
    };
}
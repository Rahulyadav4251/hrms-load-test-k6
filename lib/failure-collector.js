
// lib/failure-collector.js

import { Counter } from 'k6/metrics';

// metric (for dashboards / thresholds)
export const failedRequestsCounter = new Counter('failed_requests');

// in-memory error store (for debugging)
export const failedRequestLogs = [];

// function to record detailed failure info
export function recordFailedRequest(error) {
    failedRequestLogs.push({
        timestamp: new Date().toISOString(),
        ...error,
    });
}

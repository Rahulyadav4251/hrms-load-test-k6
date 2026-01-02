// lib/logger.js
export function logJson(type, payload) {
    console.error(JSON.stringify({
        ts: new Date().toISOString(),
        type,
        ...payload,
    }));
}

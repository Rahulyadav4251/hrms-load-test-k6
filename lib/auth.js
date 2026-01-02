    // lib/auth.js
    import http from 'k6/http';
    import { check } from 'k6';
    import { logJson } from './logger.js';

    const tokenCache = {};

    export function getToken(baseUrl, username, password) {
        const cacheKey = `${username}@${baseUrl}`;

        if (tokenCache[cacheKey]?.expiresAt > Date.now()) {
            return { success: true, token: tokenCache[cacheKey].token };
        }

        let res;
        try {
            res = http.post(
                `${baseUrl}/v1/user/login`,
                JSON.stringify({
                    login_user_name: username,
                    login_password: password,
                }),
                { headers: { 'Content-Type': 'application/json' } }
            );
        } catch (err) {
            logJson('AUTH_EXCEPTION', {
                username,
                error: err.message,
            });
            return { success: false };
        }

        const ok = check(res, { 'login success': r => r.status === 200 });
        const token = res.json('token');

        if (!ok || !token) {
            logJson('AUTH_FAILED', {
                username,
                status: res.status,
                response: res.body?.slice(0, 300),
            });
            return { success: false };
        }

        tokenCache[cacheKey] = {
            token,
            expiresAt: Date.now() + ((res.json('expires_in') || 3600) * 1000),
        };

        return { success: true, token };
    }

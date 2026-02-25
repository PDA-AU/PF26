import axios from 'axios';

const API_TIMEOUT_MS = 12000;
const MIN_API_LOADER_MS = 400;
const PDA_ACCESS_TOKEN_KEY = 'pdaAccessToken';
const PDA_REFRESH_TOKEN_KEY = 'pdaRefreshToken';

const backendBaseRaw = String(process.env.REACT_APP_BACKEND_URL || '').trim();
const backendBase = backendBaseRaw ? backendBaseRaw.replace(/\/+$/, '') : '';
const apiBase = backendBase ? `${backendBase}/api` : '/api';

const isBackendApiRequest = (url) => {
    const value = String(url || '').trim();
    if (!value) return false;
    if (value.startsWith('/api/')) return true;
    if (!backendBase) return value.includes('/api/');
    return value.startsWith(`${backendBase}/api/`);
};

const sleep = (ms) => new Promise((resolve) => {
    if (ms <= 0) {
        resolve();
        return;
    }
    window.setTimeout(resolve, ms);
});

let initialized = false;
let pdaRefreshPromise = null;

const getPathnameFromUrl = (url) => {
    const raw = String(url || '').trim();
    if (!raw) return '';
    try {
        if (raw.startsWith('http://') || raw.startsWith('https://')) {
            return new URL(raw).pathname;
        }
    } catch {
        return raw;
    }
    return raw;
};

const isPdaAdminApi = (url) => getPathnameFromUrl(url).includes('/api/pda-admin/');
const isPdaUserApi = (url) => {
    const path = getPathnameFromUrl(url);
    return path.includes('/api/pda/')
        || path.includes('/api/persohub/')
        || path.includes('/api/auth/');
};
const isRefreshApi = (url) => {
    const path = getPathnameFromUrl(url);
    return path.includes('/api/auth/refresh');
};
const isLoginLikeAuthApi = (url) => {
    const path = getPathnameFromUrl(url);
    return path.includes('/api/auth/login')
        || path.includes('/api/auth/register')
        || path.includes('/api/auth/verify-email')
        || path.includes('/api/auth/forgot-password')
        || path.includes('/api/auth/reset-password');
};

const refreshPdaAccessToken = async () => {
    if (pdaRefreshPromise) return pdaRefreshPromise;
    const refreshToken = localStorage.getItem(PDA_REFRESH_TOKEN_KEY);
    if (!refreshToken) throw new Error('Missing PDA refresh token');
    pdaRefreshPromise = axios.post(`${apiBase}/auth/refresh`, { refresh_token: refreshToken })
        .then((response) => {
            const nextAccess = response?.data?.access_token;
            const nextRefresh = response?.data?.refresh_token;
            if (!nextAccess || !nextRefresh) throw new Error('Invalid PDA refresh response');
            localStorage.setItem(PDA_ACCESS_TOKEN_KEY, nextAccess);
            localStorage.setItem(PDA_REFRESH_TOKEN_KEY, nextRefresh);
            return nextAccess;
        })
        .finally(() => {
            pdaRefreshPromise = null;
        });
    return pdaRefreshPromise;
};

export const initHttpClient = () => {
    if (initialized) return;
    initialized = true;

    axios.interceptors.request.use((config) => {
        const next = config || {};
        if (isBackendApiRequest(next.url)) {
            if (next.timeout == null) {
                next.timeout = API_TIMEOUT_MS;
            }
            next.metadata = {
                ...(next.metadata || {}),
                startedAt: Date.now(),
            };
        }
        return next;
    });

    axios.interceptors.response.use(
        async (response) => {
            const cfg = response?.config || {};
            if (isBackendApiRequest(cfg.url)) {
                const startedAt = Number(cfg?.metadata?.startedAt || 0);
                const elapsed = startedAt > 0 ? (Date.now() - startedAt) : 0;
                await sleep(MIN_API_LOADER_MS - elapsed);
            }
            return response;
        },
        async (error) => {
            const cfg = error?.config || {};
            if (isBackendApiRequest(cfg.url)) {
                const startedAt = Number(cfg?.metadata?.startedAt || 0);
                const elapsed = startedAt > 0 ? (Date.now() - startedAt) : 0;
                await sleep(MIN_API_LOADER_MS - elapsed);
            }

            const statusCode = Number(error?.response?.status || 0);
            const shouldRetryAuth = (
                statusCode === 401
                && isBackendApiRequest(cfg.url)
                && !isRefreshApi(cfg.url)
                && !isLoginLikeAuthApi(cfg.url)
                && !cfg.__auth_retry
            );
            if (!shouldRetryAuth) {
                return Promise.reject(error);
            }

            try {
                if (!isPdaAdminApi(cfg.url) && !isPdaUserApi(cfg.url)) {
                    return Promise.reject(error);
                }
                const nextAccessToken = await refreshPdaAccessToken();

                cfg.__auth_retry = true;
                cfg.headers = {
                    ...(cfg.headers || {}),
                    Authorization: `Bearer ${nextAccessToken}`,
                };
                return axios(cfg);
            } catch (refreshError) {
                localStorage.removeItem(PDA_ACCESS_TOKEN_KEY);
                localStorage.removeItem(PDA_REFRESH_TOKEN_KEY);
                if (String(refreshError?.message || '').includes('Missing PDA refresh token')) {
                    return Promise.reject(error);
                }
                return Promise.reject(refreshError);
            }
        },
    );
};

export const HTTP_CLIENT_DEFAULTS = {
    API_TIMEOUT_MS,
    MIN_API_LOADER_MS,
};

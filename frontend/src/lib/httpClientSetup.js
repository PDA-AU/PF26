import axios from 'axios';

const API_TIMEOUT_MS = 12000;
const MIN_API_LOADER_MS = 400;

const backendBaseRaw = String(process.env.REACT_APP_BACKEND_URL || '').trim();
const backendBase = backendBaseRaw ? backendBaseRaw.replace(/\/+$/, '') : '';

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
            return Promise.reject(error);
        },
    );
};

export const HTTP_CLIENT_DEFAULTS = {
    API_TIMEOUT_MS,
    MIN_API_LOADER_MS,
};

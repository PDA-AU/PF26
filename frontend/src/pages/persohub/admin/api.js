import axios from 'axios';

import { persohubApi } from '@/pages/persohub/api';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ADMIN_ACCESS_TOKEN_KEY = 'persohubAdminAccessToken';
const ADMIN_REFRESH_TOKEN_KEY = 'persohubAdminRefreshToken';

const getAdminAccessToken = () => localStorage.getItem(ADMIN_ACCESS_TOKEN_KEY);
const getAdminRefreshToken = () => localStorage.getItem(ADMIN_REFRESH_TOKEN_KEY);

const saveAdminTokens = ({ access_token, refresh_token }) => {
    localStorage.setItem(ADMIN_ACCESS_TOKEN_KEY, access_token);
    localStorage.setItem(ADMIN_REFRESH_TOKEN_KEY, refresh_token);
};

const clearAdminTokens = () => {
    localStorage.removeItem(ADMIN_ACCESS_TOKEN_KEY);
    localStorage.removeItem(ADMIN_REFRESH_TOKEN_KEY);
};

const getAdminAuthHeader = () => {
    const token = getAdminAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const refreshAdminSession = async () => {
    const refreshToken = getAdminRefreshToken();
    if (!refreshToken) {
        throw new Error('Missing admin refresh token');
    }
    const response = await axios.post(`${API}/persohub/admin/auth/refresh`, {
        refresh_token: refreshToken,
    });
    saveAdminTokens(response.data);
    return response.data;
};

const withAdminAuthRetry = async (requestFn) => {
    try {
        return await requestFn();
    } catch (error) {
        if (error?.response?.status === 401 && getAdminRefreshToken()) {
            await refreshAdminSession();
            return requestFn();
        }
        throw error;
    }
};

export const persohubAdminApi = {
    parseApiError: persohubApi.parseApiError,

    getAuthHeader() {
        return getAdminAuthHeader();
    },

    getAccessToken() {
        return getAdminAccessToken();
    },

    async login(identifier, password) {
        const response = await axios.post(`${API}/persohub/admin/auth/login`, {
            identifier,
            password,
        });
        return response.data;
    },

    async selectClub(selectionToken, clubId, communityId = null) {
        const payload = {
            selection_token: selectionToken,
            club_id: Number(clubId),
        };
        if (communityId !== null && communityId !== undefined) {
            payload.community_id = Number(communityId);
        }
        const response = await axios.post(`${API}/persohub/admin/auth/select-club`, payload);
        saveAdminTokens(response.data);
        return response.data;
    },

    async selectCommunity(selectionToken, communityId) {
        const response = await axios.post(`${API}/persohub/admin/auth/select-community`, {
            selection_token: selectionToken,
            community_id: Number(communityId),
        });
        saveAdminTokens(response.data);
        return response.data;
    },

    async me() {
        return withAdminAuthRetry(async () => {
            const response = await axios.get(`${API}/persohub/admin/auth/me`, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    logout() {
        clearAdminTokens();
    },

    async fetchAdminProfile() {
        return withAdminAuthRetry(async () => {
            const response = await axios.get(`${API}/persohub/admin/profile`, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async updateAdminCommunity(payload) {
        return withAdminAuthRetry(async () => {
            const response = await axios.put(`${API}/persohub/admin/profile/community`, payload, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async updateAdminClub(payload) {
        return withAdminAuthRetry(async () => {
            const response = await axios.put(`${API}/persohub/admin/profile/club`, payload, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async listPersohubEvents(params = {}) {
        return withAdminAuthRetry(async () => {
            const response = await axios.get(`${API}/persohub/admin/persohub-events`, {
                params,
                headers: { ...getAdminAuthHeader() },
            });
            return {
                items: response.data || [],
                totalCount: Number(response.headers?.['x-total-count'] || 0),
                page: Number(response.headers?.['x-page'] || params.page || 1),
                pageSize: Number(response.headers?.['x-page-size'] || params.page_size || 20),
            };
        });
    },

    async isPersohubEventsParityEnabled() {
        return withAdminAuthRetry(async () => {
            try {
                const response = await axios.get(`${API}/persohub/admin/persohub-events/parity-enabled`, {
                    headers: { ...getAdminAuthHeader() },
                });
                return Boolean(response.data?.enabled);
            } catch (error) {
                if (error?.response?.status === 404 || error?.response?.status === 403) {
                    return false;
                }
                throw error;
            }
        });
    },

    async listPersohubSympoOptions() {
        return withAdminAuthRetry(async () => {
            const response = await axios.get(`${API}/persohub/admin/persohub-sympo-options`, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data || [];
        });
    },

    async createPersohubEvent(payload) {
        return withAdminAuthRetry(async () => {
            const response = await axios.post(`${API}/persohub/admin/persohub-events`, payload, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async updatePersohubEvent(slug, payload) {
        return withAdminAuthRetry(async () => {
            const response = await axios.put(`${API}/persohub/admin/persohub-events/${slug}`, payload, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async assignPersohubEventSympo(slug, payload) {
        return withAdminAuthRetry(async () => {
            const response = await axios.put(`${API}/persohub/admin/persohub-events/${slug}/sympo`, payload, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async deletePersohubEvent(slug) {
        return withAdminAuthRetry(async () => {
            const response = await axios.delete(`${API}/persohub/admin/persohub-events/${slug}`, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async listOwnerCommunities() {
        return withAdminAuthRetry(async () => {
            const response = await axios.get(`${API}/persohub/admin/communities`, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data || [];
        });
    },

    async createOwnerCommunity(payload) {
        return withAdminAuthRetry(async () => {
            const response = await axios.post(`${API}/persohub/admin/communities`, payload, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async updateOwnerCommunity(communityId, payload) {
        return withAdminAuthRetry(async () => {
            const response = await axios.put(`${API}/persohub/admin/communities/${communityId}`, payload, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async resetOwnerCommunityPassword(communityId, payload) {
        return withAdminAuthRetry(async () => {
            const response = await axios.post(`${API}/persohub/admin/communities/${communityId}/reset-password`, payload, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async deleteOwnerCommunity(communityId) {
        return withAdminAuthRetry(async () => {
            const response = await axios.delete(`${API}/persohub/admin/communities/${communityId}`, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async listPersohubAdminUserOptions() {
        return withAdminAuthRetry(async () => {
            const response = await axios.get(`${API}/persohub/admin/options/admin-users`, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data || [];
        });
    },

    async listPersohubEventPolicies() {
        return withAdminAuthRetry(async () => {
            const response = await axios.get(`${API}/persohub/admin/policies/events`, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async updatePersohubEventPolicy(userId, payload) {
        return withAdminAuthRetry(async () => {
            const response = await axios.put(`${API}/persohub/admin/policies/events/${userId}`, payload, {
                headers: { ...getAdminAuthHeader() },
            });
            return response.data;
        });
    },

    async presignProfileUpload(file) {
        return withAdminAuthRetry(async () => {
            const response = await axios.post(
                `${API}/persohub/admin/profile/uploads/presign`,
                {
                    filename: file.name,
                    content_type: file.type || 'application/octet-stream',
                    size_bytes: file.size,
                },
                { headers: { ...getAdminAuthHeader() } },
            );
            return response.data;
        });
    },

    async uploadProfileImage(file) {
        const presigned = await this.presignProfileUpload(file);
        await axios.put(presigned.upload_url, file, {
            headers: { 'Content-Type': presigned.content_type || file.type || 'application/octet-stream' },
            timeout: 60000,
        });
        return presigned.public_url;
    },

    async presignEventPosterUpload(file) {
        return withAdminAuthRetry(async () => {
            const response = await axios.post(
                `${API}/persohub/community/uploads/presign`,
                {
                    filename: file.name,
                    content_type: file.type || 'application/octet-stream',
                    size_bytes: file.size,
                },
                { headers: { ...getAdminAuthHeader() } },
            );
            return response.data;
        });
    },

    async uploadEventPoster(file) {
        const presigned = await this.presignEventPosterUpload(file);
        await axios.put(presigned.upload_url, file, {
            headers: { 'Content-Type': presigned.content_type || file.type || 'application/octet-stream' },
            timeout: 60000,
        });
        return presigned.public_url;
    },
};

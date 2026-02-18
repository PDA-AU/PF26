import axios from 'axios';

import { persohubApi } from '@/pages/persohub/api';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const getCommunityAuthHeader = () => {
    const token = persohubApi.getCommunityAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const withCommunityAuthRetry = async (requestFn) => {
    try {
        return await requestFn();
    } catch (error) {
        if (error?.response?.status === 401 && persohubApi.getCommunityRefreshToken()) {
            await persohubApi.communityRefresh();
            return requestFn();
        }
        throw error;
    }
};

export const persohubAdminApi = {
    parseApiError: persohubApi.parseApiError,

    getAuthHeader() {
        return getCommunityAuthHeader();
    },

    async login(profileId, password) {
        return persohubApi.communityLogin(profileId, password);
    },

    async me() {
        return withCommunityAuthRetry(async () => {
            const response = await axios.get(`${API}/persohub/community/auth/me`, {
                headers: { ...getCommunityAuthHeader() },
            });
            return response.data;
        });
    },

    logout() {
        persohubApi.clearCommunityTokens();
    },

    async fetchAdminProfile() {
        return withCommunityAuthRetry(async () => {
            const response = await axios.get(`${API}/persohub/admin/profile`, {
                headers: { ...getCommunityAuthHeader() },
            });
            return response.data;
        });
    },

    async updateAdminCommunity(payload) {
        return withCommunityAuthRetry(async () => {
            const response = await axios.put(`${API}/persohub/admin/profile/community`, payload, {
                headers: { ...getCommunityAuthHeader() },
            });
            return response.data;
        });
    },

    async updateAdminClub(payload) {
        return withCommunityAuthRetry(async () => {
            const response = await axios.put(`${API}/persohub/admin/profile/club`, payload, {
                headers: { ...getCommunityAuthHeader() },
            });
            return response.data;
        });
    },

    async listAdminEvents(params = {}) {
        return withCommunityAuthRetry(async () => {
            const response = await axios.get(`${API}/persohub/admin/events`, {
                params,
                headers: { ...getCommunityAuthHeader() },
            });
            return {
                items: response.data || [],
                totalCount: Number(response.headers?.['x-total-count'] || 0),
                page: Number(response.headers?.['x-page'] || params.page || 1),
                pageSize: Number(response.headers?.['x-page-size'] || params.page_size || 20),
            };
        });
    },

    async listAdminSympoOptions() {
        return withCommunityAuthRetry(async () => {
            const response = await axios.get(`${API}/persohub/admin/sympo-options`, {
                headers: { ...getCommunityAuthHeader() },
            });
            return response.data || [];
        });
    },

    async createAdminEvent(payload) {
        return withCommunityAuthRetry(async () => {
            const response = await axios.post(`${API}/persohub/admin/events`, payload, {
                headers: { ...getCommunityAuthHeader() },
            });
            return response.data;
        });
    },

    async updateAdminEvent(slug, payload) {
        return withCommunityAuthRetry(async () => {
            const response = await axios.put(`${API}/persohub/admin/events/${slug}`, payload, {
                headers: { ...getCommunityAuthHeader() },
            });
            return response.data;
        });
    },

    async assignAdminEventSympo(slug, payload) {
        return withCommunityAuthRetry(async () => {
            const response = await axios.put(`${API}/persohub/admin/events/${slug}/sympo`, payload, {
                headers: { ...getCommunityAuthHeader() },
            });
            return response.data;
        });
    },

    async deleteAdminEvent(slug) {
        return withCommunityAuthRetry(async () => {
            const response = await axios.delete(`${API}/persohub/admin/events/${slug}`, {
                headers: { ...getCommunityAuthHeader() },
            });
            return response.data;
        });
    },

    async presignProfileUpload(file) {
        return withCommunityAuthRetry(async () => {
            const response = await axios.post(
                `${API}/persohub/admin/profile/uploads/presign`,
                {
                    filename: file.name,
                    content_type: file.type || 'application/octet-stream',
                    size_bytes: file.size,
                },
                { headers: { ...getCommunityAuthHeader() } },
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
        return withCommunityAuthRetry(async () => {
            const response = await axios.post(
                `${API}/persohub/community/uploads/presign`,
                {
                    filename: file.name,
                    content_type: file.type || 'application/octet-stream',
                    size_bytes: file.size,
                },
                { headers: { ...getCommunityAuthHeader() } },
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

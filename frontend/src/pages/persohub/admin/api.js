import axios from 'axios';

import { persohubApi } from '@/pages/persohub/api';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
let persohubActorHeaderGetter = () => ({});

const getPdaAuthHeader = () => {
    const token = localStorage.getItem('pdaAccessToken');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const getActorHeader = () => {
    try {
        const headers = persohubActorHeaderGetter?.();
        if (headers && typeof headers === 'object') return headers;
    } catch {
        // no-op
    }
    return {};
};

const getCombinedAuthHeader = () => ({
    ...getPdaAuthHeader(),
    ...getActorHeader(),
});

export const persohubAdminApi = {
    parseApiError: persohubApi.parseApiError,

    setActorHeaderGetter(getter) {
        persohubActorHeaderGetter = typeof getter === 'function' ? getter : (() => ({}));
    },

    getAuthHeader() {
        return getCombinedAuthHeader();
    },

    getAccessToken() {
        return localStorage.getItem('pdaAccessToken') || '';
    },

    async login() {
        throw new Error('Deprecated: use PDA auth + Persohub account switch');
    },

    async selectClub() {
        throw new Error('Deprecated: use PDA auth + Persohub account switch');
    },

    async selectCommunity() {
        throw new Error('Deprecated: use PDA auth + Persohub account switch');
    },

    async me() {
        const response = await axios.get(`${API}/persohub/session/active-community/${Number(getActorHeader()['X-Persohub-Community-Id'] || 0)}`, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    logout() {
        // Single-auth mode: full logout is handled by AuthContext.
    },

    async fetchAdminProfile() {
        const response = await axios.get(`${API}/persohub/admin/profile`, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async updateAdminCommunity(payload) {
        const response = await axios.put(`${API}/persohub/admin/profile/community`, payload, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async updateAdminClub(payload) {
        const response = await axios.put(`${API}/persohub/admin/profile/club`, payload, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async listPersohubEvents(params = {}) {
        const response = await axios.get(`${API}/persohub/admin/persohub-events`, {
            params,
            headers: { ...getCombinedAuthHeader() },
        });
        return {
            items: response.data || [],
            totalCount: Number(response.headers?.['x-total-count'] || 0),
            page: Number(response.headers?.['x-page'] || params.page || 1),
            pageSize: Number(response.headers?.['x-page-size'] || params.page_size || 20),
        };
    },

    async isPersohubEventsParityEnabled() {
        try {
            const response = await axios.get(`${API}/persohub/admin/persohub-events/parity-enabled`, {
                headers: { ...getCombinedAuthHeader() },
            });
            return Boolean(response.data?.enabled);
        } catch (error) {
            if (error?.response?.status === 404 || error?.response?.status === 403) {
                return false;
            }
            throw error;
        }
    },

    async listPersohubSympoOptions() {
        const response = await axios.get(`${API}/persohub/admin/persohub-sympo-options`, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data || [];
    },

    async createPersohubEvent(payload) {
        const response = await axios.post(`${API}/persohub/admin/persohub-events`, payload, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async requestPersohubEventAccess(slug) {
        const response = await axios.post(`${API}/persohub/admin/persohub-events/${slug}/access-request`, {}, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async updatePersohubEvent(slug, payload) {
        const response = await axios.put(`${API}/persohub/admin/persohub-events/${slug}`, payload, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async assignPersohubEventSympo(slug, payload) {
        const response = await axios.put(`${API}/persohub/admin/persohub-events/${slug}/sympo`, payload, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async deletePersohubEvent(slug) {
        const response = await axios.delete(`${API}/persohub/admin/persohub-events/${slug}`, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async listPersohubPayments(params = {}) {
        const response = await axios.get(`${API}/persohub/admin/payments`, {
            params,
            headers: { ...getCombinedAuthHeader() },
        });
        return {
            items: response.data || [],
            totalCount: Number(response.headers?.['x-total-count'] || 0),
            page: Number(response.headers?.['x-page'] || params.page || 1),
            pageSize: Number(response.headers?.['x-page-size'] || params.page_size || 20),
        };
    },

    async listPersohubPaymentEventOptions() {
        const response = await axios.get(`${API}/persohub/admin/payments/event-options`, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data || { items: [] };
    },

    async listPersohubPaymentSuggestions({ q, limit = 8 } = {}) {
        const normalized = String(q || '').trim();
        if (!normalized) return { items: [] };
        const response = await axios.get(`${API}/persohub/admin/payments/suggestions`, {
            params: { q: normalized, limit },
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data || { items: [] };
    },

    async confirmPersohubPayment(paymentId, payload) {
        const response = await axios.post(`${API}/persohub/admin/payments/${paymentId}/confirm`, payload, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async declinePersohubPayment(paymentId, payload) {
        const response = await axios.post(`${API}/persohub/admin/payments/${paymentId}/decline`, payload, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async listOwnerCommunities() {
        const response = await axios.get(`${API}/persohub/admin/communities`, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data || [];
    },

    async createOwnerCommunity(payload) {
        const response = await axios.post(`${API}/persohub/admin/communities`, payload, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async updateOwnerCommunity(communityId, payload) {
        const response = await axios.put(`${API}/persohub/admin/communities/${communityId}`, payload, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async deleteOwnerCommunity(communityId) {
        const response = await axios.delete(`${API}/persohub/admin/communities/${communityId}`, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async listPersohubAdminUserOptions() {
        const response = await axios.get(`${API}/persohub/admin/options/admin-users`, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data || [];
    },

    async listPersohubEventPolicies() {
        const response = await axios.get(`${API}/persohub/admin/policies/events`, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async updatePersohubEventPolicy(userId, payload) {
        const response = await axios.put(`${API}/persohub/admin/policies/events/${userId}`, payload, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async addEventAdmin(payload) {
        const response = await axios.post(`${API}/persohub/admin/policies/event-admins`, payload, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async removeEventAdmin(userId) {
        const response = await axios.delete(`${API}/persohub/admin/policies/event-admins/${Number(userId)}`, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async listClubSuperadmins() {
        const response = await axios.get(`${API}/persohub/admin/policies/superadmins`, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data || [];
    },

    async addClubSuperadmin(userId) {
        const response = await axios.post(
            `${API}/persohub/admin/policies/superadmins`,
            { user_id: Number(userId) },
            { headers: { ...getCombinedAuthHeader() } },
        );
        return response.data;
    },

    async revokeClubSuperadmin(userId) {
        const response = await axios.delete(`${API}/persohub/admin/policies/superadmins/${Number(userId)}`, {
            headers: { ...getCombinedAuthHeader() },
        });
        return response.data;
    },

    async presignProfileUpload(file) {
        const response = await axios.post(
            `${API}/persohub/admin/profile/uploads/presign`,
            {
                filename: file.name,
                content_type: file.type || 'application/octet-stream',
                size_bytes: file.size,
            },
            { headers: { ...getCombinedAuthHeader() } },
        );
        return response.data;
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
        const response = await axios.post(
            `${API}/persohub/community/uploads/presign`,
            {
                filename: file.name,
                content_type: file.type || 'application/octet-stream',
                size_bytes: file.size,
            },
            { headers: { ...getCombinedAuthHeader() } },
        );
        return response.data;
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

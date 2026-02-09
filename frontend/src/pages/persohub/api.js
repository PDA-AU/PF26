import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const COMMUNITY_ACCESS_TOKEN_KEY = 'persohubCommunityAccessToken';
const COMMUNITY_REFRESH_TOKEN_KEY = 'persohubCommunityRefreshToken';

const getPdaAccessToken = () => localStorage.getItem('pdaAccessToken');
const getCommunityAccessToken = () => localStorage.getItem(COMMUNITY_ACCESS_TOKEN_KEY);
const getCommunityRefreshToken = () => localStorage.getItem(COMMUNITY_REFRESH_TOKEN_KEY);

const getPdaAuthHeader = () => {
    const token = getPdaAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const getCommunityAuthHeader = () => {
    const token = getCommunityAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
};

const saveCommunityTokens = ({ access_token, refresh_token }) => {
    localStorage.setItem(COMMUNITY_ACCESS_TOKEN_KEY, access_token);
    localStorage.setItem(COMMUNITY_REFRESH_TOKEN_KEY, refresh_token);
};

const clearCommunityTokens = () => {
    localStorage.removeItem(COMMUNITY_ACCESS_TOKEN_KEY);
    localStorage.removeItem(COMMUNITY_REFRESH_TOKEN_KEY);
};

const parseApiError = (error, fallback) => {
    const detail = error?.response?.data?.detail;
    if (Array.isArray(detail)) return detail.map((item) => item?.msg || item?.detail || JSON.stringify(item)).join(', ');
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') return detail.msg || detail.detail || JSON.stringify(detail);
    if (typeof error?.message === 'string' && error.message.trim()) return error.message;
    return fallback;
};

const isTimeoutOrNetworkError = (error) => {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toUpperCase();
    return (
        code === 'ECONNABORTED'
        || code === 'ETIMEDOUT'
        || message.includes('TIMEOUT')
        || message.includes('NETWORK ERROR')
    );
};

const putWithRetry = async (url, data, headers, maxAttempts = 2) => {
    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await axios.put(url, data, {
                headers,
                timeout: 60000,
            });
        } catch (error) {
            lastError = error;
            if (attempt >= maxAttempts || !isTimeoutOrNetworkError(error)) {
                break;
            }
        }
    }
    throw lastError;
};

const assertNoCommunitySessionForUserInteraction = (actionLabel) => {
    if (getCommunityAccessToken()) {
        throw new Error(`Logout community session to ${actionLabel} as a PDA user.`);
    }
};

export const persohubApi = {
    getCommunityAccessToken,
    getCommunityRefreshToken,
    saveCommunityTokens,
    clearCommunityTokens,
    parseApiError,

    async fetchFeed(limit = 20, cursor = null) {
        const response = await axios.get(`${API}/persohub/feed`, {
            params: { limit, ...(cursor ? { cursor } : {}) },
            headers: { ...getPdaAuthHeader() },
        });
        return response.data;
    },

    async fetchCommunities() {
        const response = await axios.get(`${API}/persohub/communities`, {
            headers: { ...getPdaAuthHeader() },
        });
        return response.data;
    },

    async fetchPost(slugToken) {
        const response = await axios.get(`${API}/persohub/posts/${slugToken}`, {
            headers: { ...getPdaAuthHeader() },
        });
        return response.data;
    },

    async fetchComments(slugToken, { limit = 20, cursor = null } = {}) {
        const response = await axios.get(`${API}/persohub/posts/${slugToken}/comments`, {
            params: { limit, ...(cursor ? { cursor } : {}) },
        });
        return response.data;
    },

    async createComment(slugToken, commentText) {
        assertNoCommunitySessionForUserInteraction('comment');
        const response = await axios.post(
            `${API}/persohub/posts/${slugToken}/comments`,
            { comment_text: commentText },
            { headers: { ...getPdaAuthHeader() } },
        );
        return response.data;
    },

    async toggleLike(slugToken) {
        assertNoCommunitySessionForUserInteraction('like');
        const response = await axios.post(
            `${API}/persohub/posts/${slugToken}/like-toggle`,
            {},
            { headers: { ...getPdaAuthHeader() } },
        );
        return response.data;
    },

    async fetchHashtagPosts(hashtag) {
        const response = await axios.get(`${API}/persohub/hashtags/${encodeURIComponent(hashtag)}/posts`, {
            headers: { ...getPdaAuthHeader() },
        });
        return response.data;
    },

    async searchSuggestions(q) {
        const response = await axios.get(`${API}/persohub/search/suggestions`, {
            params: { q },
        });
        return response.data;
    },

    async fetchProfile(profileName) {
        const response = await axios.get(`${API}/persohub/profile/${encodeURIComponent(profileName)}`, {
            headers: {
                ...getPdaAuthHeader(),
                ...getCommunityAuthHeader(),
            },
        });
        return response.data;
    },

    async toggleCommunityFollow(profileId) {
        const response = await axios.post(
            `${API}/persohub/communities/${encodeURIComponent(profileId)}/follow-toggle`,
            {},
            { headers: { ...getPdaAuthHeader() } },
        );
        return response.data;
    },

    async communityLogin(profileId, password) {
        const response = await axios.post(`${API}/persohub/community/auth/login`, {
            profile_id: profileId,
            password,
        });
        this.saveCommunityTokens(response.data);
        return response.data;
    },

    async communityRefresh() {
        const refreshToken = getCommunityRefreshToken();
        if (!refreshToken) throw new Error('Missing community refresh token');

        const response = await axios.post(`${API}/persohub/community/auth/refresh`, {
            refresh_token: refreshToken,
        });
        this.saveCommunityTokens(response.data);
        return response.data;
    },

    async communityMe() {
        try {
            const response = await axios.get(`${API}/persohub/community/auth/me`, {
                headers: { ...getCommunityAuthHeader() },
            });
            return response.data;
        } catch (error) {
            if (error?.response?.status === 401 && getCommunityRefreshToken()) {
                await this.communityRefresh();
                const response = await axios.get(`${API}/persohub/community/auth/me`, {
                    headers: { ...getCommunityAuthHeader() },
                });
                return response.data;
            }
            throw error;
        }
    },

    async createCommunityPost(payload) {
        const response = await axios.post(`${API}/persohub/community/posts`, payload, {
            headers: { ...getCommunityAuthHeader() },
        });
        return response.data;
    },

    async updateCommunityPost(slugToken, payload) {
        const response = await axios.put(`${API}/persohub/community/posts/${slugToken}`, payload, {
            headers: { ...getCommunityAuthHeader() },
        });
        return response.data;
    },

    async deleteCommunityPost(slugToken) {
        const response = await axios.delete(`${API}/persohub/community/posts/${slugToken}`, {
            headers: { ...getCommunityAuthHeader() },
        });
        return response.data;
    },

    async presignSingleUpload(file) {
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
    },

    async initMultipartUpload(file) {
        const response = await axios.post(
            `${API}/persohub/community/uploads/multipart/init`,
            {
                filename: file.name,
                content_type: file.type || 'application/octet-stream',
                size_bytes: file.size,
            },
            { headers: { ...getCommunityAuthHeader() } },
        );
        return response.data;
    },

    async getMultipartPartUrl(payload) {
        const response = await axios.post(`${API}/persohub/community/uploads/multipart/part-url`, payload, {
            headers: { ...getCommunityAuthHeader() },
        });
        return response.data;
    },

    async completeMultipartUpload(payload) {
        const response = await axios.post(`${API}/persohub/community/uploads/multipart/complete`, payload, {
            headers: { ...getCommunityAuthHeader() },
        });
        return response.data;
    },

    async abortMultipartUpload(payload) {
        const response = await axios.post(`${API}/persohub/community/uploads/multipart/abort`, payload, {
            headers: { ...getCommunityAuthHeader() },
        });
        return response.data;
    },

    async generatePdfPreview(payload) {
        const response = await axios.post(`${API}/persohub/community/uploads/pdf-preview`, payload, {
            headers: { ...getCommunityAuthHeader() },
        });
        return response.data;
    },

    async uploadAttachment(file) {
        const maybeGeneratePdfPreview = async (s3Url) => {
            const isPdf = String(file.type || '').toLowerCase() === 'application/pdf'
                || String(file.name || '').toLowerCase().endsWith('.pdf');
            if (!isPdf) return [];
            try {
                const preview = await this.generatePdfPreview({ s3_url: s3Url, max_pages: 20 });
                return preview?.preview_image_urls || [];
            } catch {
                return [];
            }
        };

        const shouldTrySingle = file.size <= 100 * 1024 * 1024;
        if (shouldTrySingle) {
            const single = await this.presignSingleUpload(file);
            try {
                await putWithRetry(single.upload_url, file, { 'Content-Type': single.content_type }, 2);
                const previewImageUrls = await maybeGeneratePdfPreview(single.public_url);
                return {
                    s3_url: single.public_url,
                    preview_image_urls: previewImageUrls,
                    mime_type: file.type || 'application/octet-stream',
                    size_bytes: file.size,
                };
            } catch (error) {
                // Fall back to multipart if direct PUT is flaky.
                if (!isTimeoutOrNetworkError(error)) {
                    throw error;
                }
            }
        }

        const multipart = await this.initMultipartUpload(file);
        const chunkSize = multipart.part_size || (10 * 1024 * 1024);
        const parts = [];

        try {
            let partNumber = 1;
            for (let offset = 0; offset < file.size; offset += chunkSize) {
                const chunk = file.slice(offset, offset + chunkSize);
                const partUrlRes = await this.getMultipartPartUrl({
                    key: multipart.key,
                    upload_id: multipart.upload_id,
                    part_number: partNumber,
                });
                const putRes = await axios.put(partUrlRes.upload_url, chunk, {
                    headers: {
                        'Content-Type': file.type || 'application/octet-stream',
                    },
                    timeout: 60000,
                });
                const etagRaw = putRes.headers?.etag || putRes.headers?.ETag;
                const etag = String(etagRaw || '').replace(/\"/g, '');
                if (!etag) throw new Error(`Missing ETag for multipart part ${partNumber}`);
                parts.push({ part_number: partNumber, etag });
                partNumber += 1;
            }

            const completeRes = await this.completeMultipartUpload({
                key: multipart.key,
                upload_id: multipart.upload_id,
                parts,
            });
            const previewImageUrls = await maybeGeneratePdfPreview(completeRes.public_url);

            return {
                s3_url: completeRes.public_url,
                preview_image_urls: previewImageUrls,
                mime_type: file.type || 'application/octet-stream',
                size_bytes: file.size,
            };
        } catch (error) {
            await this.abortMultipartUpload({ key: multipart.key, upload_id: multipart.upload_id });
            throw error;
        }
    },
};

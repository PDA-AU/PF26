import axios from 'axios';
import { API } from '@/pages/HomeAdmin/adminApi';

export const ccAdminApi = {
    listClubs: (headers) => axios.get(`${API}/pda-admin/cc/clubs`, { headers }),
    createClub: (payload, headers) => axios.post(`${API}/pda-admin/cc/clubs`, payload, { headers }),
    updateClub: (clubId, payload, headers) => axios.put(`${API}/pda-admin/cc/clubs/${clubId}`, payload, { headers }),
    deleteClub: (clubId, headers) => axios.delete(`${API}/pda-admin/cc/clubs/${clubId}`, { headers }),

    listCommunities: (headers) => axios.get(`${API}/pda-admin/cc/communities`, { headers }),
    createCommunity: (payload, headers) => axios.post(`${API}/pda-admin/cc/communities`, payload, { headers }),
    updateCommunity: (communityId, payload, headers) => axios.put(`${API}/pda-admin/cc/communities/${communityId}`, payload, { headers }),
    deleteCommunity: (communityId, headers) => axios.delete(`${API}/pda-admin/cc/communities/${communityId}`, { headers }),

    listSympos: (headers) => axios.get(`${API}/pda-admin/cc/persohub-sympos`, { headers }),
    createSympo: (payload, headers) => axios.post(`${API}/pda-admin/cc/persohub-sympos`, payload, { headers }),
    updateSympo: (sympoId, payload, headers) => axios.put(`${API}/pda-admin/cc/persohub-sympos/${sympoId}`, payload, { headers }),
    deleteSympo: (sympoId, headers) => axios.delete(`${API}/pda-admin/cc/persohub-sympos/${sympoId}`, { headers }),

    listPersohubEventOptions: (headers, params = {}) => axios.get(`${API}/pda-admin/cc/options/persohub-events`, { headers, params }),
    assignPersohubEventSympo: (eventId, payload, headers) => axios.put(`${API}/pda-admin/cc/persohub-events/${eventId}/sympo`, payload, { headers }),
    approvePersohubEventAccess: (eventId, payload, headers) => axios.post(`${API}/pda-admin/cc/persohub-events/${eventId}/access/approve`, payload || {}, { headers }),
    rejectPersohubEventAccess: (eventId, payload, headers) => axios.post(`${API}/pda-admin/cc/persohub-events/${eventId}/access/reject`, payload || {}, { headers }),
    listPersohubPayments: (headers, params = {}) => axios.get(`${API}/pda-admin/cc/payments`, { headers, params }),
    confirmPersohubPayment: (paymentId, payload, headers) => axios.post(`${API}/pda-admin/cc/payments/${paymentId}/confirm`, payload, { headers }),
    declinePersohubPayment: (paymentId, payload, headers) => axios.post(`${API}/pda-admin/cc/payments/${paymentId}/decline`, payload, { headers }),
    listAdminUserOptions: (headers) => axios.get(`${API}/pda-admin/cc/options/admin-users`, { headers }),
    listBadges: (headers) => axios.get(`${API}/pda-admin/cc/badges`, { headers }),
    createBadge: (payload, headers) => axios.post(`${API}/pda-admin/cc/badges`, payload, { headers }),
    updateBadge: (badgeId, payload, headers) => axios.patch(`${API}/pda-admin/cc/badges/${badgeId}`, payload, { headers }),
    deleteBadge: (badgeId, headers) => axios.delete(`${API}/pda-admin/cc/badges/${badgeId}`, { headers }),
    listBadgeAssignments: (headers, params = {}) => axios.get(`${API}/pda-admin/cc/badge-assignments`, { headers, params }),
    createBadgeAssignment: (payload, headers) => axios.post(`${API}/pda-admin/cc/badge-assignments`, payload, { headers }),
    createBulkBadgeAssignments: (payload, headers) => axios.post(`${API}/pda-admin/cc/badge-assignments/bulk`, payload, { headers }),
    deleteBadgeAssignment: (assignmentId, headers) => axios.delete(`${API}/pda-admin/cc/badge-assignments/${assignmentId}`, { headers }),
    listBadgeUserOptions: (headers, params = {}) => axios.get(`${API}/pda-admin/cc/options/users`, { headers, params }),

    presignLogoUpload: (file, headers) => axios.post(`${API}/pda-admin/cc/logos/presign`, {
        filename: file.name,
        content_type: file.type,
    }, { headers }),
    presignBadgeRevealVideoUpload: (file, headers) => axios.post(`${API}/pda-admin/cc/badges/reveal-video/presign`, {
        filename: file.name,
        content_type: file.type,
    }, { headers }),
};

export const uploadCcLogo = async (file, getAuthHeader) => {
    const headers = getAuthHeader();
    const presignRes = await ccAdminApi.presignLogoUpload(file, headers);
    const { upload_url, public_url, content_type } = presignRes.data || {};
    await axios.put(upload_url, file, {
        headers: { 'Content-Type': content_type || file.type },
    });
    return public_url;
};

export const uploadCcBadgeRevealVideo = async (file, getAuthHeader) => {
    const headers = getAuthHeader();
    const normalizedFile = { name: file.name, type: file.type || 'video/mp4' };
    const presignRes = await ccAdminApi.presignBadgeRevealVideoUpload(normalizedFile, headers);
    const { upload_url, public_url, content_type } = presignRes.data || {};
    await axios.put(upload_url, file, {
        headers: { 'Content-Type': content_type || file.type || 'video/mp4' },
    });
    return public_url;
};

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
    resetCommunityPassword: (communityId, payload, headers) =>
        axios.post(`${API}/pda-admin/cc/communities/${communityId}/reset-password`, payload, { headers }),
    deleteCommunity: (communityId, headers) => axios.delete(`${API}/pda-admin/cc/communities/${communityId}`, { headers }),

    listSympos: (headers) => axios.get(`${API}/pda-admin/cc/sympos`, { headers }),
    createSympo: (payload, headers) => axios.post(`${API}/pda-admin/cc/sympos`, payload, { headers }),
    updateSympo: (sympoId, payload, headers) => axios.put(`${API}/pda-admin/cc/sympos/${sympoId}`, payload, { headers }),
    deleteSympo: (sympoId, headers) => axios.delete(`${API}/pda-admin/cc/sympos/${sympoId}`, { headers }),

    listCommunityEventOptions: (headers, params = {}) => axios.get(`${API}/pda-admin/cc/options/community-events`, { headers, params }),
    assignCommunityEventSympo: (eventId, payload, headers) => axios.put(`${API}/pda-admin/cc/community-events/${eventId}/sympo`, payload, { headers }),
    listAdminUserOptions: (headers) => axios.get(`${API}/pda-admin/cc/options/admin-users`, { headers }),

    presignLogoUpload: (file, headers) => axios.post(`${API}/pda-admin/cc/logos/presign`, {
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

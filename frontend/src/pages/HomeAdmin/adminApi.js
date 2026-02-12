import axios from 'axios';

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const uploadPoster = async (file, getAuthHeader) => {
    const presignRes = await axios.post(`${API}/pda-admin/posters/presign`, {
        filename: file.name,
        content_type: file.type
    }, { headers: getAuthHeader() });
    const { upload_url, public_url, content_type } = presignRes.data || {};
    await axios.put(upload_url, file, { headers: { 'Content-Type': content_type || file.type } });
    return public_url;
};

export const generatePosterPdfPreview = async (s3Url, getAuthHeader, maxPages = 20) => {
    const response = await axios.post(
        `${API}/pda-admin/posters/pdf-preview`,
        { s3_url: s3Url, max_pages: maxPages },
        { headers: getAuthHeader() }
    );
    return response.data;
};

export const uploadGalleryImage = async (file, getAuthHeader) => {
    const presignRes = await axios.post(`${API}/pda-admin/gallery-uploads/presign`, {
        filename: file.name,
        content_type: file.type
    }, { headers: getAuthHeader() });
    const { upload_url, public_url, content_type } = presignRes.data || {};
    await axios.put(upload_url, file, { headers: { 'Content-Type': content_type || file.type } });
    return public_url;
};

export const uploadTeamImage = async (file, getAuthHeader) => {
    const presignRes = await axios.post(`${API}/pda-admin/team-uploads/presign`, {
        filename: file.name,
        content_type: file.type
    }, { headers: getAuthHeader() });
    const { upload_url, public_url, content_type } = presignRes.data || {};
    await axios.put(upload_url, file, { headers: { 'Content-Type': content_type || file.type } });
    return public_url;
};

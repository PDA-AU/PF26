import axios from 'axios';

export const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const uploadPoster = async (file, getAuthHeader) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API}/pda-admin/posters`, formData, {
        headers: {
            ...getAuthHeader(),
            'Content-Type': 'multipart/form-data'
        }
    });
    return response.data?.url;
};

export const uploadGalleryImage = async (file, getAuthHeader) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API}/pda-admin/gallery-uploads`, formData, {
        headers: {
            ...getAuthHeader(),
            'Content-Type': 'multipart/form-data'
        }
    });
    return response.data?.url;
};

export const uploadTeamImage = async (file, getAuthHeader) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await axios.post(`${API}/pda-admin/team-uploads`, formData, {
        headers: {
            ...getAuthHeader(),
            'Content-Type': 'multipart/form-data'
        }
    });
    return response.data?.url;
};

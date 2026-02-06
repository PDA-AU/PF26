import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const ParticipantAuthContext = createContext(null);
const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const ParticipantAuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [accessToken, setAccessToken] = useState(localStorage.getItem('participantAccessToken'));
    const [refreshToken, setRefreshToken] = useState(localStorage.getItem('participantRefreshToken'));

    const logout = useCallback(() => {
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        localStorage.removeItem('participantAccessToken');
        localStorage.removeItem('participantRefreshToken');
    }, []);

    const tryRefreshToken = useCallback(async () => {
        if (!refreshToken) {
            logout();
            return;
        }
        try {
            const response = await axios.post(`${API}/participant-auth/refresh`, {
                refresh_token: refreshToken
            });
            const { access_token, refresh_token: newRefresh, user: userData } = response.data;
            setAccessToken(access_token);
            setRefreshToken(newRefresh);
            localStorage.setItem('participantAccessToken', access_token);
            localStorage.setItem('participantRefreshToken', newRefresh);
            setUser(userData);
        } catch (error) {
            console.error('Token refresh failed:', error);
            logout();
        }
    }, [logout, refreshToken]);

    const fetchUser = useCallback(async () => {
        try {
            const response = await axios.get(`${API}/participant/me`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            setUser(response.data);
        } catch (error) {
            console.error('Failed to fetch participant:', error);
            if (error.response?.status === 401) {
                await tryRefreshToken();
            }
        } finally {
            setLoading(false);
        }
    }, [accessToken, tryRefreshToken]);

    useEffect(() => {
        if (accessToken) {
            fetchUser();
        } else {
            setLoading(false);
        }
    }, [accessToken, fetchUser]);

    const login = async (registerNumber, password) => {
        const response = await axios.post(`${API}/participant-auth/login`, {
            register_number: registerNumber,
            password: password
        });
        const { access_token, refresh_token, user: userData } = response.data;
        setAccessToken(access_token);
        setRefreshToken(refresh_token);
        localStorage.setItem('participantAccessToken', access_token);
        localStorage.setItem('participantRefreshToken', refresh_token);
        setUser(userData);
        return userData;
    };

    const register = async (userData) => {
        const response = await axios.post(`${API}/participant-auth/register`, userData);
        const { access_token, refresh_token, user: newUser } = response.data;
        setAccessToken(access_token);
        setRefreshToken(refresh_token);
        localStorage.setItem('participantAccessToken', access_token);
        localStorage.setItem('participantRefreshToken', refresh_token);
        setUser(newUser);
        return newUser;
    };

    const updateUser = (updatedData) => {
        setUser(prev => ({ ...prev, ...updatedData }));
    };

    const getAuthHeader = () => {
        return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    };

    return (
        <ParticipantAuthContext.Provider value={{
            user,
            loading,
            login,
            register,
            logout,
            updateUser,
            getAuthHeader,
            accessToken
        }}>
            {children}
        </ParticipantAuthContext.Provider>
    );
};

export const useParticipantAuth = () => {
    const context = useContext(ParticipantAuthContext);
    if (!context) {
        throw new Error('useParticipantAuth must be used within a ParticipantAuthProvider');
    }
    return context;
};

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [accessToken, setAccessToken] = useState(localStorage.getItem('accessToken'));
    const [refreshToken, setRefreshToken] = useState(localStorage.getItem('refreshToken'));

    const logout = useCallback(() => {
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
    }, []);

    const tryRefreshToken = useCallback(async () => {
        if (!refreshToken) {
            logout();
            return;
        }
        try {
            const response = await axios.post(`${API}/auth/refresh`, {
                refresh_token: refreshToken
            });
            const { access_token, refresh_token: newRefresh, user: userData } = response.data;
            setAccessToken(access_token);
            setRefreshToken(newRefresh);
            localStorage.setItem('accessToken', access_token);
            localStorage.setItem('refreshToken', newRefresh);
            setUser(userData);
        } catch (error) {
            console.error('Token refresh failed:', error);
            logout();
        }
    }, [logout, refreshToken]);

    const fetchUser = useCallback(async () => {
        try {
            const response = await axios.get(`${API}/me`, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });
            setUser(response.data);
        } catch (error) {
            console.error('Failed to fetch user:', error);
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
        const response = await axios.post(`${API}/auth/login`, {
            register_number: registerNumber,
            password: password
        });
        const { access_token, refresh_token, user: userData } = response.data;
        setAccessToken(access_token);
        setRefreshToken(refresh_token);
        localStorage.setItem('accessToken', access_token);
        localStorage.setItem('refreshToken', refresh_token);
        setUser(userData);
        return userData;
    };

    const register = async (userData) => {
        const response = await axios.post(`${API}/auth/register`, userData);
        const { access_token, refresh_token, user: newUser } = response.data;
        setAccessToken(access_token);
        setRefreshToken(refresh_token);
        localStorage.setItem('accessToken', access_token);
        localStorage.setItem('refreshToken', refresh_token);
        setUser(newUser);
        return newUser;
    };

    const updateUser = (updatedData) => {
        setUser(prev => ({ ...prev, ...updatedData }));
    };

    const getAuthHeader = () => {
        return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    };

    const isAdmin = user?.role === 'admin';
    const isParticipant = user?.role === 'participant';

    return (
        <AuthContext.Provider value={{
            user,
            loading,
            login,
            register,
            logout,
            updateUser,
            getAuthHeader,
            isAdmin,
            isParticipant,
            accessToken
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

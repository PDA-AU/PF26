import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [accessToken, setAccessToken] = useState(localStorage.getItem('pdaAccessToken'));
    const [refreshToken, setRefreshToken] = useState(localStorage.getItem('pdaRefreshToken'));

    const logout = useCallback(() => {
        setUser(null);
        setAccessToken(null);
        setRefreshToken(null);
        localStorage.removeItem('pdaAccessToken');
        localStorage.removeItem('pdaRefreshToken');
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
            localStorage.setItem('pdaAccessToken', access_token);
            localStorage.setItem('pdaRefreshToken', newRefresh);
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
            regno: registerNumber,
            password: password
        });
        const { access_token, refresh_token, user: userData } = response.data;
        setAccessToken(access_token);
        setRefreshToken(refresh_token);
            localStorage.setItem('pdaAccessToken', access_token);
            localStorage.setItem('pdaRefreshToken', refresh_token);
        setUser(userData);
        return response.data;
    };

    const register = async (userData) => {
        const response = await axios.post(`${API}/auth/register`, userData);
        if (response.status === 202 || response.data?.status === 'verification_required') {
            return { status: 'verification_required' };
        }
        const { access_token, refresh_token, user: newUser } = response.data;
        setAccessToken(access_token);
        setRefreshToken(refresh_token);
        localStorage.setItem('pdaAccessToken', access_token);
        localStorage.setItem('pdaRefreshToken', refresh_token);
        setUser(newUser);
        return newUser;
    };

    const updateUser = (updatedData) => {
        setUser(prev => ({ ...prev, ...updatedData }));
    };

    const getAuthHeader = () => {
        return accessToken ? { Authorization: `Bearer ${accessToken}` } : {};
    };

    const isSuperAdmin = user?.is_superadmin;
    const isAdmin = user?.is_admin || isSuperAdmin;
    const canAccessHome = isSuperAdmin || user?.policy?.home;
    const eventPolicyMap = (user?.policy && typeof user.policy.events === 'object' && user.policy.events) ? user.policy.events : {};
    const canAccessEvents = isSuperAdmin || Object.values(eventPolicyMap).some((value) => Boolean(value));
    const canAccessEvent = (slug) => isSuperAdmin || Boolean(eventPolicyMap?.[slug]);
    const isParticipant = false;

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
            isSuperAdmin,
            canAccessHome,
            canAccessEvents,
            canAccessEvent,
            eventPolicyMap,
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

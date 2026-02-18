import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { persohubAdminApi } from '@/pages/persohub/admin/api';

const PersohubAdminAuthContext = createContext(null);

export function PersohubAdminAuthProvider({ children }) {
    const [community, setCommunity] = useState(null);
    const [loading, setLoading] = useState(true);

    const logout = useCallback(() => {
        persohubAdminApi.logout();
        setCommunity(null);
    }, []);

    const loadSession = useCallback(async () => {
        if (!persohubAdminApi.getAuthHeader().Authorization) {
            setCommunity(null);
            setLoading(false);
            return;
        }

        try {
            const me = await persohubAdminApi.me();
            setCommunity(me || null);
        } catch {
            persohubAdminApi.logout();
            setCommunity(null);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadSession();
    }, [loadSession]);

    const login = useCallback(async (profileId, password) => {
        const response = await persohubAdminApi.login(profileId, password);
        setCommunity(response?.community || null);
        return response;
    }, []);

    const getAuthHeader = useCallback(() => persohubAdminApi.getAuthHeader(), []);

    const value = useMemo(() => ({
        community,
        loading,
        login,
        logout,
        getAuthHeader,
        reloadSession: loadSession,
    }), [community, loading, login, logout, getAuthHeader, loadSession]);

    return (
        <PersohubAdminAuthContext.Provider value={value}>
            {children}
        </PersohubAdminAuthContext.Provider>
    );
}

export function usePersohubAdminAuth() {
    const context = useContext(PersohubAdminAuthContext);
    if (!context) {
        throw new Error('usePersohubAdminAuth must be used within PersohubAdminAuthProvider');
    }
    return context;
}

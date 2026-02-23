import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { persohubAdminApi } from '@/pages/persohub/admin/api';

const PersohubAdminAuthContext = createContext(null);

export function PersohubAdminAuthProvider({ children }) {
    const [community, setCommunity] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectionToken, setSelectionToken] = useState('');
    const [availableClubs, setAvailableClubs] = useState([]);

    const clearSelection = useCallback(() => {
        setSelectionToken('');
        setAvailableClubs([]);
    }, []);

    const logout = useCallback(() => {
        persohubAdminApi.logout();
        setCommunity(null);
        clearSelection();
    }, [clearSelection]);

    const loadSession = useCallback(async () => {
        if (!persohubAdminApi.getAuthHeader().Authorization) {
            setCommunity(null);
            setLoading(false);
            return;
        }

        try {
            const me = await persohubAdminApi.me();
            setCommunity(me || null);
            clearSelection();
        } catch {
            persohubAdminApi.logout();
            setCommunity(null);
            clearSelection();
        } finally {
            setLoading(false);
        }
    }, [clearSelection]);

    useEffect(() => {
        loadSession();
    }, [loadSession]);

    const login = useCallback(async (identifier, password) => {
        const response = await persohubAdminApi.login(identifier, password);
        setSelectionToken(response?.selection_token || '');
        setAvailableClubs(response?.clubs || response?.communities || []);
        return response;
    }, []);

    const selectClub = useCallback(async (clubId, communityId = null) => {
        if (!selectionToken) {
            throw new Error('No pending club selection');
        }
        const response = await persohubAdminApi.selectClub(selectionToken, clubId, communityId);
        setCommunity(response?.community || null);
        clearSelection();
        return response;
    }, [clearSelection, selectionToken]);

    const selectCommunity = useCallback(async (communityId) => {
        if (!selectionToken) {
            throw new Error('No pending club selection');
        }
        const response = await persohubAdminApi.selectCommunity(selectionToken, communityId);
        setCommunity(response?.community || null);
        clearSelection();
        return response;
    }, [clearSelection, selectionToken]);

    const getAuthHeader = useCallback(() => persohubAdminApi.getAuthHeader(), []);

    const value = useMemo(() => ({
        community,
        loading,
        login,
        logout,
        selectClub,
        selectCommunity,
        pendingSelectionToken: selectionToken,
        availableClubs,
        availableCommunities: availableClubs,
        getAuthHeader,
        reloadSession: loadSession,
        clearSelection,
    }), [
        availableClubs,
        clearSelection,
        community,
        getAuthHeader,
        loadSession,
        loading,
        login,
        logout,
        selectClub,
        selectCommunity,
        selectionToken,
    ]);

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

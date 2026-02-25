import React, { createContext, useCallback, useContext, useMemo } from 'react';

import { useAuth } from '@/context/AuthContext';
import { usePersohubActor } from '@/context/PersohubActorContext';

const PersohubAdminAuthContext = createContext(null);

export function PersohubAdminAuthProvider({ children }) {
    const { logout: pdaLogout, getAuthHeader, loading: authLoading } = useAuth();
    const {
        resolvedCommunity,
        mode,
        setMode,
        activeCommunityId,
        setActiveCommunityId,
        switchableCommunities,
        canUseCommunityMode,
        loading: actorLoading,
        loadSwitchOptions,
        getPersohubActorHeader,
    } = usePersohubActor();
    const ownerCommunities = useMemo(
        () => (switchableCommunities || []).filter((item) => Boolean(item?.is_club_owner || item?.is_club_superadmin)),
        [switchableCommunities],
    );
    const adminCommunity = (mode === 'community' && (resolvedCommunity?.is_club_owner || resolvedCommunity?.is_club_superadmin)) ? resolvedCommunity : null;
    const adminCanUseCommunityMode = ownerCommunities.length > 0;

    const logout = useCallback(() => {
        pdaLogout();
    }, [pdaLogout]);

    const getMergedAuthHeader = useCallback(() => ({
        ...getAuthHeader(),
        ...getPersohubActorHeader(),
    }), [getAuthHeader, getPersohubActorHeader]);

    const value = useMemo(() => ({
        community: adminCommunity,
        loading: authLoading || actorLoading,
        login: async () => {
            throw new Error('Deprecated: use PDA login + account switch');
        },
        logout,
        selectClub: async () => {
            throw new Error('Deprecated: use account switch');
        },
        selectCommunity: async () => {
            throw new Error('Deprecated: use account switch');
        },
        pendingSelectionToken: '',
        availableClubs: [],
        availableCommunities: ownerCommunities,
        getAuthHeader: getMergedAuthHeader,
        reloadSession: loadSwitchOptions,
        clearSelection: () => {},
        mode,
        setMode,
        activeCommunityId,
        setActiveCommunityId,
        switchableCommunities: ownerCommunities,
        canUseCommunityMode: adminCanUseCommunityMode,
    }), [
        activeCommunityId,
        actorLoading,
        authLoading,
        adminCanUseCommunityMode,
        adminCommunity,
        getMergedAuthHeader,
        loadSwitchOptions,
        logout,
        mode,
        ownerCommunities,
        setActiveCommunityId,
        setMode,
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

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';

import { useAuth } from '@/context/AuthContext';
import { persohubApi } from '@/pages/persohub/api';
import { persohubAdminApi } from '@/pages/persohub/admin/api';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const MODE_KEY = 'persohubActorMode';
const COMMUNITY_ID_KEY = 'persohubActorCommunityId';

const PersohubActorContext = createContext(null);

export function PersohubActorProvider({ children }) {
    const { user, loading: authLoading, getAuthHeader } = useAuth();
    const [mode, setModeState] = useState(() => localStorage.getItem(MODE_KEY) || 'user');
    const [activeCommunityId, setActiveCommunityIdState] = useState(() => {
        const raw = localStorage.getItem(COMMUNITY_ID_KEY);
        const parsed = Number(raw || 0);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    });
    const [switchableCommunities, setSwitchableCommunities] = useState([]);
    const [resolvedCommunity, setResolvedCommunity] = useState(null);
    const [loading, setLoading] = useState(false);

    const getPersohubActorHeader = useCallback(() => {
        if (mode !== 'community' || !activeCommunityId) return {};
        return { 'X-Persohub-Community-Id': String(activeCommunityId) };
    }, [activeCommunityId, mode]);

    useEffect(() => {
        persohubApi.setActorHeaderGetter(getPersohubActorHeader);
        persohubAdminApi.setActorHeaderGetter(getPersohubActorHeader);
    }, [getPersohubActorHeader]);

    const loadSwitchOptions = useCallback(async () => {
        if (!user) {
            setSwitchableCommunities([]);
            setResolvedCommunity(null);
            return;
        }
        setLoading(true);
        try {
            const response = await axios.get(`${API}/persohub/session/options`, {
                headers: { ...getAuthHeader() },
            });
            const items = response?.data?.items || [];
            setSwitchableCommunities(items);
            if (items.length === 0) {
                setModeState('user');
                setActiveCommunityIdState(null);
                setResolvedCommunity(null);
                localStorage.setItem(MODE_KEY, 'user');
                localStorage.removeItem(COMMUNITY_ID_KEY);
                return;
            }
            if (activeCommunityId && !items.some((item) => Number(item.id) === Number(activeCommunityId))) {
                setActiveCommunityIdState(null);
            }
        } catch {
            setSwitchableCommunities([]);
            setResolvedCommunity(null);
            setModeState('user');
            setActiveCommunityIdState(null);
            localStorage.setItem(MODE_KEY, 'user');
            localStorage.removeItem(COMMUNITY_ID_KEY);
        } finally {
            setLoading(false);
        }
    }, [activeCommunityId, getAuthHeader, user]);

    useEffect(() => {
        if (authLoading) return;
        if (!user) {
            setModeState('user');
            setActiveCommunityIdState(null);
            setSwitchableCommunities([]);
            setResolvedCommunity(null);
            localStorage.setItem(MODE_KEY, 'user');
            localStorage.removeItem(COMMUNITY_ID_KEY);
            return;
        }
        loadSwitchOptions();
    }, [authLoading, loadSwitchOptions, user]);

    useEffect(() => {
        if (!user || mode !== 'community' || !activeCommunityId) {
            setResolvedCommunity(null);
            return;
        }

        let cancelled = false;
        setLoading(true);
        axios.get(`${API}/persohub/session/active-community/${Number(activeCommunityId)}`, {
            headers: { ...getAuthHeader() },
        }).then((response) => {
            if (cancelled) return;
            setResolvedCommunity(response?.data || null);
        }).catch(() => {
            if (cancelled) return;
            setResolvedCommunity(null);
        }).finally(() => {
            if (!cancelled) setLoading(false);
        });

        return () => {
            cancelled = true;
        };
    }, [activeCommunityId, getAuthHeader, mode, user]);

    useEffect(() => {
        localStorage.setItem(MODE_KEY, mode);
    }, [mode]);

    useEffect(() => {
        if (activeCommunityId) {
            localStorage.setItem(COMMUNITY_ID_KEY, String(activeCommunityId));
        } else {
            localStorage.removeItem(COMMUNITY_ID_KEY);
        }
    }, [activeCommunityId]);

    const setMode = useCallback((nextMode) => {
        if (nextMode !== 'community') {
            setModeState('user');
            return;
        }
        setModeState('community');
    }, []);

    const setActiveCommunityId = useCallback((communityId) => {
        const numeric = Number(communityId || 0);
        setActiveCommunityIdState(Number.isFinite(numeric) && numeric > 0 ? numeric : null);
    }, []);

    const canUseCommunityMode = switchableCommunities.length > 0;

    const value = useMemo(() => ({
        mode,
        setMode,
        activeCommunityId,
        setActiveCommunityId,
        switchableCommunities,
        resolvedCommunity,
        canUseCommunityMode,
        loading: loading || authLoading,
        loadSwitchOptions,
        getPersohubActorHeader,
    }), [
        activeCommunityId,
        authLoading,
        canUseCommunityMode,
        getPersohubActorHeader,
        loadSwitchOptions,
        loading,
        mode,
        resolvedCommunity,
        setActiveCommunityId,
        setMode,
        switchableCommunities,
    ]);

    return (
        <PersohubActorContext.Provider value={value}>
            {children}
        </PersohubActorContext.Provider>
    );
}

export function usePersohubActor() {
    const context = useContext(PersohubActorContext);
    if (!context) {
        throw new Error('usePersohubActor must be used within PersohubActorProvider');
    }
    return context;
}

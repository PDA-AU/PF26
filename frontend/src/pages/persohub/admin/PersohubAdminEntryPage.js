import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import PersohubAdminLayout from '@/pages/persohub/admin/PersohubAdminLayout';
import LoadingState from '@/components/common/LoadingState';

export default function PersohubAdminEntryPage() {
    const navigate = useNavigate();
    const { community, loading } = usePersohubAdminAuth();

    useEffect(() => {
        if (!loading && community) {
            navigate('/persohub/admin/profile', { replace: true });
        }
    }, [community, loading, navigate]);

    if (loading) {
        return <LoadingState fullScreen />;
    }

    if (community) {
        return <LoadingState fullScreen />;
    }

    return (
        <PersohubAdminLayout title="Persohub Admin" subtitle="Manage your club-scoped communities and delegated event access." activeTab="profile">
            <div />
        </PersohubAdminLayout>
    );
}

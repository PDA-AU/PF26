import React from 'react';
import { Navigate } from 'react-router-dom';

import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import PersohubAdminLayout from '@/pages/persohub/admin/PersohubAdminLayout';

export default function PersohubAdminEntryPage() {
    const { community, loading } = usePersohubAdminAuth();

    if (!loading && community) {
        return <Navigate to="/persohub/admin/profile" replace />;
    }

    return (
        <PersohubAdminLayout title="Persohub Admin" subtitle="Manage your community and linked club profile details." activeTab="profile">
            <div />
        </PersohubAdminLayout>
    );
}

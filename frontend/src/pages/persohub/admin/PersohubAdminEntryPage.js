import React from 'react';

import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import PersohubAdminLayout from '@/pages/persohub/admin/PersohubAdminLayout';

export default function PersohubAdminEntryPage() {
    usePersohubAdminAuth();

    return (
        <PersohubAdminLayout title="Persohub Admin" subtitle="Manage your club-scoped communities and delegated event access." activeTab="profile">
            <div />
        </PersohubAdminLayout>
    );
}

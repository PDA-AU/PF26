import React from 'react';
import { Navigate } from 'react-router-dom';

import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import PersohubAdminLayout from '@/pages/persohub/admin/PersohubAdminLayout';

export default function PersohubAdminEntryPage() {
    const { community, loading } = usePersohubAdminAuth();

    if (!loading && community) {
        if (community.is_club_owner) {
            return <Navigate to="/persohub/admin/profile" replace />;
        }
        if (community.can_access_events) {
            return <Navigate to="/persohub/admin/persohub-events" replace />;
        }
        return (
            <PersohubAdminLayout title="Persohub Admin" subtitle="No delegated event policies are assigned to this account." activeTab="events">
                <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                    Event access is currently not assigned for this club account. Ask your club owner to enable event policy access.
                </section>
            </PersohubAdminLayout>
        );
    }

    return (
        <PersohubAdminLayout title="Persohub Admin" subtitle="Manage your club-scoped communities and delegated event access." activeTab="profile">
            <div />
        </PersohubAdminLayout>
    );
}

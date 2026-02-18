import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePersohubAdminAuth } from '@/context/PersohubAdminAuthContext';
import { persohubAdminApi } from '@/pages/persohub/admin/api';
import PersohubAdminLayout from '@/pages/persohub/admin/PersohubAdminLayout';
import LogoUploadField from '@/pages/persohub/admin/components/LogoUploadField';
import ProfileEditModal from '@/pages/persohub/admin/components/ProfileEditModal';
import ProfileSummaryCard from '@/pages/persohub/admin/components/ProfileSummaryCard';

const emptyCommunityForm = {
    name: '',
    logo_url: '',
    description: '',
};

const emptyClubForm = {
    name: '',
    club_logo_url: '',
    club_tagline: '',
    club_description: '',
    club_url: '',
};

export default function PersohubAdminProfilePage() {
    const { community } = usePersohubAdminAuth();

    const [loading, setLoading] = useState(true);
    const [profile, setProfile] = useState(null);

    const [communityModalOpen, setCommunityModalOpen] = useState(false);
    const [clubModalOpen, setClubModalOpen] = useState(false);

    const [communityForm, setCommunityForm] = useState(emptyCommunityForm);
    const [clubForm, setClubForm] = useState(emptyClubForm);

    const [savingCommunity, setSavingCommunity] = useState(false);
    const [savingClub, setSavingClub] = useState(false);

    const loadProfile = useCallback(async () => {
        if (!community) {
            setLoading(false);
            setProfile(null);
            return;
        }

        setLoading(true);
        try {
            const response = await persohubAdminApi.fetchAdminProfile();
            setProfile(response);
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to load admin profile'));
        } finally {
            setLoading(false);
        }
    }, [community]);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    const openCommunityModal = () => {
        if (!profile?.community) return;
        setCommunityForm({
            name: profile.community.name || '',
            logo_url: profile.community.logo_url || '',
            description: profile.community.description || '',
        });
        setCommunityModalOpen(true);
    };

    const openClubModal = () => {
        if (!profile?.club) return;
        setClubForm({
            name: profile.club.name || '',
            club_logo_url: profile.club.club_logo_url || '',
            club_tagline: profile.club.club_tagline || '',
            club_description: profile.club.club_description || '',
            club_url: profile.club.club_url || '',
        });
        setClubModalOpen(true);
    };

    const handleSaveCommunity = async () => {
        setSavingCommunity(true);
        try {
            const response = await persohubAdminApi.updateAdminCommunity({
                name: communityForm.name,
                logo_url: communityForm.logo_url || null,
                description: communityForm.description || null,
            });
            setProfile(response);
            setCommunityModalOpen(false);
            toast.success('Community profile updated');
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to update community profile'));
        } finally {
            setSavingCommunity(false);
        }
    };

    const handleSaveClub = async () => {
        setSavingClub(true);
        try {
            const response = await persohubAdminApi.updateAdminClub({
                name: clubForm.name,
                club_logo_url: clubForm.club_logo_url || null,
                club_tagline: clubForm.club_tagline || null,
                club_description: clubForm.club_description || null,
                club_url: clubForm.club_url || null,
            });
            setProfile(response);
            setClubModalOpen(false);
            toast.success('Club profile updated');
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to update club profile'));
        } finally {
            setSavingClub(false);
        }
    };

    const communityFields = useMemo(() => {
        if (!profile?.community) return [];
        return [
            { label: 'Name', value: profile.community.name },
            { label: 'Profile ID', value: profile.community.profile_id },
            { label: 'Logo URL', value: profile.community.logo_url },
            { label: 'Active', value: profile.community.is_active ? 'Yes' : 'No' },
            { label: 'Description', value: profile.community.description, fullWidth: true },
        ];
    }, [profile]);

    const clubFields = useMemo(() => {
        if (!profile?.club) return [];
        return [
            { label: 'Name', value: profile.club.name },
            { label: 'Logo URL', value: profile.club.club_logo_url },
            { label: 'Tagline', value: profile.club.club_tagline },
            { label: 'Website', value: profile.club.club_url },
            { label: 'Description', value: profile.club.club_description, fullWidth: true },
            { label: 'Linked Communities', value: String(profile.club.linked_community_count || 0) },
        ];
    }, [profile]);

    return (
        <PersohubAdminLayout
            title="Persohub Admin Profile"
            subtitle="Manage your community and linked club profile metadata."
            activeTab="profile"
        >
            {loading ? (
                <section className="rounded-2xl border border-black/10 bg-white p-5 text-sm text-slate-600">
                    Loading profile details...
                </section>
            ) : null}

            {!loading && profile?.community ? (
                <ProfileSummaryCard
                    title="Community Profile"
                    subtitle="Editable by the logged-in community admin account"
                    fields={communityFields}
                    onEdit={openCommunityModal}
                />
            ) : null}

            {!loading && profile?.club ? (
                <ProfileSummaryCard
                    title="Club Profile"
                    subtitle="Shared club edits are restricted for safety"
                    fields={clubFields}
                    onEdit={openClubModal}
                    editDisabled={!profile.club.can_edit}
                    disabledReason={
                        !profile.club.can_edit
                            ? 'This club is linked to multiple communities. Club edits are blocked for this account.'
                            : ''
                    }
                />
            ) : null}

            {!loading && !profile?.club ? (
                <section className="rounded-2xl border border-black/10 bg-white p-5 text-sm text-slate-600">
                    No club is currently linked to this community account.
                </section>
            ) : null}

            <ProfileEditModal
                open={communityModalOpen}
                onOpenChange={setCommunityModalOpen}
                title="Edit Community Profile"
                subtitle="Update your own community details."
                submitting={savingCommunity}
                onSubmit={handleSaveCommunity}
            >
                <div className="space-y-2">
                    <Label htmlFor="community-name">Community Name</Label>
                    <Input
                        id="community-name"
                        value={communityForm.name}
                        onChange={(event) => setCommunityForm((prev) => ({ ...prev, name: event.target.value }))}
                        required
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="community-profile-id">Profile ID (read-only)</Label>
                    <Input id="community-profile-id" value={profile?.community?.profile_id || ''} readOnly disabled />
                </div>

                <LogoUploadField
                    id="community-logo-url"
                    label="Community Logo URL"
                    value={communityForm.logo_url}
                    onChange={(value) => setCommunityForm((prev) => ({ ...prev, logo_url: value }))}
                    onUploadFile={(file) => persohubAdminApi.uploadProfileImage(file)}
                    parseApiError={persohubAdminApi.parseApiError}
                />

                <div className="space-y-2">
                    <Label htmlFor="community-description">Description</Label>
                    <Textarea
                        id="community-description"
                        value={communityForm.description}
                        onChange={(event) => setCommunityForm((prev) => ({ ...prev, description: event.target.value }))}
                        rows={5}
                    />
                </div>
            </ProfileEditModal>

            <ProfileEditModal
                open={clubModalOpen}
                onOpenChange={setClubModalOpen}
                title="Edit Club Profile"
                subtitle="Update linked club details."
                submitting={savingClub}
                onSubmit={handleSaveClub}
            >
                <div className="space-y-2">
                    <Label htmlFor="club-name">Club Name</Label>
                    <Input
                        id="club-name"
                        value={clubForm.name}
                        onChange={(event) => setClubForm((prev) => ({ ...prev, name: event.target.value }))}
                        required
                    />
                </div>

                <LogoUploadField
                    id="club-logo-url"
                    label="Club Logo URL"
                    value={clubForm.club_logo_url}
                    onChange={(value) => setClubForm((prev) => ({ ...prev, club_logo_url: value }))}
                    onUploadFile={(file) => persohubAdminApi.uploadProfileImage(file)}
                    parseApiError={persohubAdminApi.parseApiError}
                />

                <div className="space-y-2">
                    <Label htmlFor="club-tagline">Club Tagline</Label>
                    <Input
                        id="club-tagline"
                        value={clubForm.club_tagline}
                        onChange={(event) => setClubForm((prev) => ({ ...prev, club_tagline: event.target.value }))}
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="club-url">Club URL</Label>
                    <Input
                        id="club-url"
                        value={clubForm.club_url}
                        onChange={(event) => setClubForm((prev) => ({ ...prev, club_url: event.target.value }))}
                        placeholder="https://..."
                    />
                </div>

                <div className="space-y-2">
                    <Label htmlFor="club-description">Club Description</Label>
                    <Textarea
                        id="club-description"
                        value={clubForm.club_description}
                        onChange={(event) => setClubForm((prev) => ({ ...prev, club_description: event.target.value }))}
                        rows={5}
                    />
                </div>
            </ProfileEditModal>
        </PersohubAdminLayout>
    );
}

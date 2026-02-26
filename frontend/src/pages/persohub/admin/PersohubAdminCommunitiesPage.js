import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import LoadingState from '@/components/common/LoadingState';
import PersohubAdminLayout from '@/pages/persohub/admin/PersohubAdminLayout';
import { persohubAdminApi } from '@/pages/persohub/admin/api';

const makeAdminRowId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptyForm = {
    name: '',
    profile_id: '',
    logo_url: '',
    description: '',
    is_active: true,
    admins: [{ row_id: makeAdminRowId(), user_id: '', is_active: true }],
};

const normalizePayload = (form, isCreate) => {
    const admins = (form.admins || [])
        .map((row) => ({
            user_id: Number(row.user_id),
            is_active: Boolean(row.is_active),
        }))
        .filter((row) => Number.isFinite(row.user_id) && row.user_id > 0);

    if (!admins.length || admins.every((row) => !row.is_active)) {
        throw new Error('At least one active admin is required');
    }

    const payload = {
        name: String(form.name || '').trim(),
        logo_url: String(form.logo_url || '').trim() || null,
        description: String(form.description || '').trim() || null,
        is_active: Boolean(form.is_active),
        admins,
    };

    if (isCreate) {
        payload.profile_id = String(form.profile_id || '').trim().toLowerCase();
    }

    return payload;
};

export default function PersohubAdminCommunitiesPage() {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [rows, setRows] = useState([]);
    const [adminOptions, setAdminOptions] = useState([]);

    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingCommunity, setEditingCommunity] = useState(null);
    const [form, setForm] = useState(emptyForm);
    const [adminSearch, setAdminSearch] = useState('');
    const [logoFile, setLogoFile] = useState(null);
    const [logoPreviewUrl, setLogoPreviewUrl] = useState('');
    const [logoUploading, setLogoUploading] = useState(false);

    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleteConfirmText, setDeleteConfirmText] = useState('');

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [communityRows, options] = await Promise.all([
                persohubAdminApi.listOwnerCommunities(),
                persohubAdminApi.listPersohubAdminUserOptions(),
            ]);
            setRows(communityRows || []);
            setAdminOptions(options || []);
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to load communities'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        return () => {
            if (String(logoPreviewUrl || '').startsWith('blob:')) {
                URL.revokeObjectURL(logoPreviewUrl);
            }
        };
    }, [logoPreviewUrl]);

    const openCreateDialog = () => {
        setEditingCommunity(null);
        setForm({ ...emptyForm, admins: [{ row_id: makeAdminRowId(), user_id: '', is_active: true }] });
        setAdminSearch('');
        setLogoFile(null);
        setLogoPreviewUrl('');
        setDialogOpen(true);
    };

    const openEditDialog = (community) => {
        const adminRows = (community.admins || []).map((item) => ({
            row_id: makeAdminRowId(),
            user_id: String(item.user_id || ''),
            is_active: Boolean(item.is_active),
        }));
        setEditingCommunity(community);
        setForm({
            name: community.name || '',
            profile_id: community.profile_id || '',
            logo_url: community.logo_url || '',
            description: community.description || '',
            is_active: Boolean(community.is_active),
            admins: adminRows.length ? adminRows : [{ row_id: makeAdminRowId(), user_id: '', is_active: true }],
        });
        setAdminSearch('');
        setLogoFile(null);
        setLogoPreviewUrl(String(community.logo_url || '').trim());
        setDialogOpen(true);
    };

    const onLogoFileChange = (event) => {
        const file = event?.target?.files?.[0] || null;
        if (!file) {
            return;
        }
        if (!String(file.type || '').startsWith('image/')) {
            toast.error('Only image files are allowed');
            return;
        }
        setLogoFile(file);
        const objectUrl = URL.createObjectURL(file);
        setLogoPreviewUrl(objectUrl);
    };

    const uploadSelectedLogo = async () => {
        if (!logoFile) return;
        setLogoUploading(true);
        try {
            const uploadedUrl = await persohubAdminApi.uploadProfileImage(logoFile);
            setForm((prev) => ({ ...prev, logo_url: String(uploadedUrl || '').trim() }));
            setLogoPreviewUrl(String(uploadedUrl || '').trim());
            setLogoFile(null);
            toast.success('Community logo uploaded');
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to upload logo'));
        } finally {
            setLogoUploading(false);
        }
    };

    const clearLogo = () => {
        setLogoFile(null);
        setLogoPreviewUrl('');
        setForm((prev) => ({ ...prev, logo_url: '' }));
    };

    const addAdminRow = () => {
        setForm((prev) => ({
            ...prev,
            admins: [...(prev.admins || []), { row_id: makeAdminRowId(), user_id: '', is_active: true }],
        }));
    };

    const removeAdminRow = (rowId) => {
        setForm((prev) => ({
            ...prev,
            admins: (prev.admins || []).filter((row) => row.row_id !== rowId),
        }));
    };

    const usedAdminIds = useMemo(() => {
        return new Set((form.admins || []).map((item) => String(item.user_id || '')).filter(Boolean));
    }, [form.admins]);

    const filteredAdminOptions = useMemo(() => {
        const query = String(adminSearch || '').trim().toLowerCase();
        if (!query) return adminOptions;
        return (adminOptions || []).filter((option) => (
            `${option.name || ''} ${option.regno || ''} ${option.id || ''}`.toLowerCase().includes(query)
        ));
    }, [adminOptions, adminSearch]);

    const adminSuggestions = useMemo(() => {
        const query = String(adminSearch || '').trim();
        if (!query) return [];
        return (filteredAdminOptions || [])
            .filter((option) => !usedAdminIds.has(String(option.id)))
            .slice(0, 8);
    }, [filteredAdminOptions, usedAdminIds, adminSearch]);

    const applyAdminSuggestion = (userId) => {
        const nextUserId = String(userId || '');
        if (!nextUserId) return;
        if (usedAdminIds.has(nextUserId)) {
            toast.error('Admin already added');
            return;
        }
        setForm((prev) => {
            const rows = [...(prev.admins || [])];
            const emptyRowIndex = rows.findIndex((row) => !String(row.user_id || '').trim());
            if (emptyRowIndex >= 0) {
                rows[emptyRowIndex] = { ...rows[emptyRowIndex], user_id: nextUserId };
                return { ...prev, admins: rows };
            }
            return {
                ...prev,
                admins: [...rows, { row_id: makeAdminRowId(), user_id: nextUserId, is_active: true }],
            };
        });
        setAdminSearch('');
    };

    const submitCommunity = async (event) => {
        event.preventDefault();
        if (logoFile) {
            toast.error('Upload selected logo before saving');
            return;
        }
        setSaving(true);
        try {
            const payload = normalizePayload(form, !editingCommunity);
            if (editingCommunity) {
                await persohubAdminApi.updateOwnerCommunity(editingCommunity.id, payload);
                toast.success('Community updated');
            } else {
                await persohubAdminApi.createOwnerCommunity(payload);
                toast.success('Community created');
            }
            setDialogOpen(false);
            setEditingCommunity(null);
            setForm(emptyForm);
            setLogoFile(null);
            setLogoPreviewUrl('');
            await loadData();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, error?.message || 'Failed to save community'));
        } finally {
            setSaving(false);
        }
    };

    const submitDelete = async () => {
        if (!deleteTarget) return;
        if (deleteConfirmText !== 'DELETE') {
            toast.error('Type DELETE to confirm');
            return;
        }
        setSaving(true);
        try {
            await persohubAdminApi.deleteOwnerCommunity(deleteTarget.id);
            toast.success('Community deleted');
            setDeleteTarget(null);
            setDeleteConfirmText('');
            await loadData();
        } catch (error) {
            toast.error(persohubAdminApi.parseApiError(error, 'Failed to delete community'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <PersohubAdminLayout
            title="Persohub Communities"
            subtitle="Owner-only community management for this club."
            activeTab="communities"
        >
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                    <h2 className="text-2xl font-heading font-black">Communities</h2>
                    <Button onClick={openCreateDialog} className="bg-[#11131a] text-white">Add Community</Button>
                </div>

                {loading ? (
                    <LoadingState variant="inline" containerClassName="mt-4" />
                ) : rows.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">No communities in this club yet.</p>
                ) : (
                    <div className="mt-4 space-y-3">
                        {rows.map((community) => (
                            <article key={community.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <h3 className="font-heading text-xl font-black">{community.name}</h3>
                                        <p className="text-xs text-slate-500">
                                            @{community.profile_id} | Active: {community.is_active ? 'Yes' : 'No'} | Default: {community.is_root ? 'Yes' : 'No'}
                                        </p>
                                        <p className="mt-1 text-sm text-slate-600">Admins: {(community.admins || []).filter((item) => item.is_active).map((item) => item.name || item.regno || item.user_id).join(', ') || 'None'}</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button variant="outline" className="border-black/20" onClick={() => openEditDialog(community)}>Edit</Button>
                                        <Button
                                            variant="destructive"
                                            onClick={() => {
                                                setDeleteTarget(community);
                                                setDeleteConfirmText('');
                                            }}
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            <Dialog open={dialogOpen} onOpenChange={(open) => !saving && setDialogOpen(open)}>
                <DialogContent className="max-w-3xl">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-2xl font-black">
                            {editingCommunity ? 'Edit Community' : 'Create Community'}
                        </DialogTitle>
                    </DialogHeader>
                    <form className="grid gap-4 md:grid-cols-2" onSubmit={submitCommunity}>
                        <div>
                            <Label>Name</Label>
                            <Input value={form.name} onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} required />
                        </div>
                        <div>
                            <Label>Profile ID</Label>
                            <Input
                                value={form.profile_id}
                                onChange={(e) => setForm((prev) => ({ ...prev, profile_id: e.target.value }))}
                                disabled={Boolean(editingCommunity)}
                                required
                            />
                        </div>
                        <div>
                            <Label>Active</Label>
                            <Select
                                value={form.is_active ? 'active' : 'inactive'}
                                onValueChange={(value) => setForm((prev) => ({ ...prev, is_active: value === 'active' }))}
                            >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="active">Active</SelectItem>
                                    <SelectItem value="inactive">Inactive</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="md:col-span-2 space-y-3">
                            <Label>Logo</Label>
                            {logoPreviewUrl ? (
                                <img
                                    src={logoPreviewUrl}
                                    alt="Community logo preview"
                                    className="h-24 w-24 rounded-lg border border-black/10 object-cover"
                                />
                            ) : (
                                <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-black/20 bg-slate-50 text-xs text-slate-500">
                                    No logo
                                </div>
                            )}
                            <Input type="file" accept="image/*" onChange={onLogoFileChange} />
                            <div className="flex flex-wrap gap-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="border-black/20"
                                    onClick={uploadSelectedLogo}
                                    disabled={!logoFile || saving || logoUploading}
                                >
                                    {logoUploading ? 'Uploading...' : 'Upload to S3'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="border-black/20"
                                    onClick={clearLogo}
                                    disabled={saving || logoUploading}
                                >
                                    Remove Logo
                                </Button>
                            </div>
                            {form.logo_url ? (
                                <p className="text-xs text-slate-500 break-all">{form.logo_url}</p>
                            ) : null}
                        </div>
                        <div className="md:col-span-2">
                            <Label>Description</Label>
                            <Textarea rows={4} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
                        </div>

                        <div className="md:col-span-2 rounded-xl border border-black/10 bg-slate-50 p-3">
                            <div className="mb-3 flex items-center justify-between">
                                <Label className="font-semibold">Admins</Label>
                                <Button type="button" variant="outline" className="border-black/20" onClick={addAdminRow}>Add Admin</Button>
                            </div>
                            <div className="mb-3">
                                <Input
                                    value={adminSearch}
                                    onChange={(e) => setAdminSearch(e.target.value)}
                                    placeholder="Search admin users by name, regno, or id"
                                />
                                {adminSuggestions.length ? (
                                    <div className="mt-2 max-h-44 overflow-auto rounded-md border border-black/10 bg-white p-1">
                                        {adminSuggestions.map((option) => (
                                            <button
                                                key={option.id}
                                                type="button"
                                                onClick={() => applyAdminSuggestion(option.id)}
                                                className="w-full rounded px-2 py-1 text-left text-sm hover:bg-slate-100"
                                            >
                                                {(option.name || option.regno || option.id)} ({option.regno || option.id})
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                            <div className="space-y-2">
                                {(form.admins || []).map((row) => (
                                    <div key={row.row_id} className="grid gap-2 md:grid-cols-[1fr_auto_auto]">
                                        <Select
                                            value={String(row.user_id || '')}
                                            onValueChange={(value) => {
                                                setForm((prev) => ({
                                                    ...prev,
                                                    admins: (prev.admins || []).map((item) => (
                                                        item.row_id === row.row_id ? { ...item, user_id: value } : item
                                                    )),
                                                }));
                                            }}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Select user" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {filteredAdminOptions.map((option) => {
                                                    const optionValue = String(option.id);
                                                    const alreadyUsed = usedAdminIds.has(optionValue) && String(row.user_id || '') !== optionValue;
                                                    return (
                                                        <SelectItem key={option.id} value={optionValue} disabled={alreadyUsed}>
                                                            {(option.name || option.regno || option.id)} ({option.regno || option.id})
                                                        </SelectItem>
                                                    );
                                                })}
                                            </SelectContent>
                                        </Select>
                                        <Select
                                            value={row.is_active ? 'active' : 'inactive'}
                                            onValueChange={(value) => {
                                                setForm((prev) => ({
                                                    ...prev,
                                                    admins: (prev.admins || []).map((item) => (
                                                        item.row_id === row.row_id ? { ...item, is_active: value === 'active' } : item
                                                    )),
                                                }));
                                            }}
                                        >
                                            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="active">Active</SelectItem>
                                                <SelectItem value="inactive">Inactive</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Button type="button" variant="outline" className="border-black/20" onClick={() => removeAdminRow(row.row_id)}>
                                            Remove
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="md:col-span-2 flex justify-end gap-2">
                            <Button type="button" variant="outline" className="border-black/20" disabled={saving} onClick={() => setDialogOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" className="bg-[#11131a] text-white" disabled={saving}>
                                {saving ? 'Saving...' : editingCommunity ? 'Save Changes' : 'Create Community'}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !saving && !open && setDeleteTarget(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-heading text-2xl font-black text-red-600">Delete Community</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <p className="text-sm text-slate-700">
                            This deletes community profile data and detaches any linked events from the community provenance.
                        </p>
                        <p className="text-sm font-semibold text-slate-700">Type DELETE to confirm.</p>
                        <Input value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" />
                        <div className="flex justify-end gap-2">
                            <Button variant="outline" className="border-black/20" disabled={saving} onClick={() => setDeleteTarget(null)}>Cancel</Button>
                            <Button variant="destructive" disabled={saving || deleteConfirmText !== 'DELETE'} onClick={submitDelete}>
                                {saving ? 'Deleting...' : 'Delete Community'}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </PersohubAdminLayout>
    );
}

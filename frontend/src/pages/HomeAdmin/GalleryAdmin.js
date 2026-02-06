import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { API, uploadGalleryImage } from '@/pages/HomeAdmin/adminApi';

const emptyEditItem = {
    id: null,
    caption: '',
    tag: ''
};

export default function GalleryAdmin() {
    const { canAccessHome, getAuthHeader } = useAuth();
    const [galleryItems, setGalleryItems] = useState([]);
    const [uploads, setUploads] = useState([]);
    const [editForm, setEditForm] = useState(emptyEditItem);
    const [savingUploads, setSavingUploads] = useState(false);
    const [savingEdit, setSavingEdit] = useState(false);
    const [loading, setLoading] = useState(true);
    const [gallerySearch, setGallerySearch] = useState('');

    const fetchData = async () => {
        try {
            const galleryRes = await axios.get(`${API}/pda/gallery`);
            setGalleryItems(galleryRes.data || []);
        } catch (error) {
            console.error('Failed to load gallery:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (canAccessHome) {
            fetchData();
        }
    }, [canAccessHome]);

    const handleUploadsSelected = (files) => {
        const next = Array.from(files || []).map((file) => ({
            id: `${file.name}-${file.size}-${file.lastModified}`,
            file,
            caption: '',
            tag: '',
            previewUrl: URL.createObjectURL(file)
        }));
        uploads.forEach((item) => {
            if (item.previewUrl) {
                URL.revokeObjectURL(item.previewUrl);
            }
        });
        setUploads(next);
    };

    const updateUploadMeta = (id, field, value) => {
        setUploads((prev) =>
            prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
        );
    };

    const removeUpload = (id) => {
        setUploads((prev) => {
            const target = prev.find((item) => item.id === id);
            if (target?.previewUrl) {
                URL.revokeObjectURL(target.previewUrl);
            }
            return prev.filter((item) => item.id !== id);
        });
    };

    const submitUploads = async (e) => {
        e.preventDefault();
        if (!uploads.length) return;
        setSavingUploads(true);
        try {
            const uploadedUrls = await Promise.all(
                uploads.map((item) => uploadGalleryImage(item.file, getAuthHeader))
            );
            const createPayloads = uploads.map((item, index) => ({
                photo_url: uploadedUrls[index],
                caption: item.caption.trim() || null,
                tag: item.tag.trim() || null
            }));
            await Promise.all(
                createPayloads.map((payload) =>
                    axios.post(`${API}/pda-admin/gallery`, payload, { headers: getAuthHeader() })
                )
            );
            uploads.forEach((item) => {
                if (item.previewUrl) {
                    URL.revokeObjectURL(item.previewUrl);
                }
            });
            setUploads([]);
            fetchData();
        } catch (error) {
            console.error('Failed to upload gallery items:', error);
        } finally {
            setSavingUploads(false);
        }
    };

    const startEdit = (item) => {
        setEditForm({
            id: item.id,
            caption: item.caption || '',
            tag: item.tag || ''
        });
    };

    const cancelEdit = () => {
        setEditForm(emptyEditItem);
    };

    const submitEdit = async (e) => {
        e.preventDefault();
        if (!editForm.id) return;
        setSavingEdit(true);
        try {
            await axios.put(`${API}/pda-admin/gallery/${editForm.id}`, {
                caption: editForm.caption.trim() || null,
                tag: editForm.tag.trim() || null
            }, { headers: getAuthHeader() });
            cancelEdit();
            fetchData();
        } catch (error) {
            console.error('Failed to update gallery item:', error);
        } finally {
            setSavingEdit(false);
        }
    };

    const deleteGalleryItem = async (itemId) => {
        try {
            await axios.delete(`${API}/pda-admin/gallery/${itemId}`, { headers: getAuthHeader() });
            fetchData();
        } catch (error) {
            console.error('Failed to delete gallery item:', error);
        }
    };

    const filteredGallery = galleryItems.filter((item) =>
        [item.caption, item.tag]
            .filter(Boolean)
            .some((value) => value.toLowerCase().includes(gallerySearch.toLowerCase()))
    );

    return (
        <AdminLayout title="Gallery Management" subtitle="Manage the photo gallery shown on the PDA home page.">
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Gallery</p>
                        <h2 className="text-2xl font-heading font-black">Gallery Management</h2>
                    </div>
                </div>

                <form onSubmit={submitUploads} className="mt-6 grid gap-4">
                    <div>
                        <Label htmlFor="gallery-upload-files">Upload Photos</Label>
                        <Input
                            id="gallery-upload-files"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            multiple
                            onChange={(e) => handleUploadsSelected(e.target.files)}
                        />
                    </div>
                    {uploads.length ? (
                        <div className="grid gap-4 md:grid-cols-2">
                            {uploads.map((item) => (
                                <div key={item.id} className="rounded-2xl border border-black/10 bg-white p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-start gap-3">
                                            {item.previewUrl ? (
                                                <img
                                                    src={item.previewUrl}
                                                    alt={item.file.name}
                                                    className="h-16 w-16 rounded-lg object-cover border border-black/10"
                                                />
                                            ) : null}
                                            <div>
                                                <p className="text-sm font-semibold">{item.file.name}</p>
                                                <p className="text-xs text-slate-500">{(item.file.size / 1024).toFixed(1)} KB</p>
                                            </div>
                                        </div>
                                        <button type="button" onClick={() => removeUpload(item.id)} className="text-xs text-red-600">
                                            Remove
                                        </button>
                                    </div>
                                    <div className="mt-3 grid gap-3">
                                        <div>
                                            <Label className="text-xs">Caption (optional)</Label>
                                            <Input
                                                value={item.caption}
                                                onChange={(e) => updateUploadMeta(item.id, 'caption', e.target.value)}
                                                placeholder="Short caption"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Tag (optional)</Label>
                                            <Input
                                                value={item.tag}
                                                onChange={(e) => updateUploadMeta(item.id, 'tag', e.target.value)}
                                                placeholder="e.g. Workshop"
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : null}
                    <div className="flex justify-end">
                        <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={savingUploads || !uploads.length}>
                            {savingUploads ? 'Uploading...' : `Upload ${uploads.length || ''}`.trim()}
                        </Button>
                    </div>
                </form>

                {editForm.id ? (
                    <form onSubmit={submitEdit} className="mt-10 rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-heading font-bold">Edit Gallery Item</h3>
                            <Button type="button" variant="outline" onClick={cancelEdit} className="border-black/10 text-xs">
                                Cancel
                            </Button>
                        </div>
                        <div className="mt-4 grid gap-3 md:grid-cols-2">
                            <div>
                                <Label>Caption</Label>
                                <Input
                                    value={editForm.caption}
                                    onChange={(e) => setEditForm((prev) => ({ ...prev, caption: e.target.value }))}
                                />
                            </div>
                            <div>
                                <Label>Tag</Label>
                                <Input
                                    value={editForm.tag}
                                    onChange={(e) => setEditForm((prev) => ({ ...prev, tag: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="mt-4 flex justify-end">
                            <Button type="submit" className="bg-[#11131a] text-white hover:bg-[#1f2330]" disabled={savingEdit}>
                                {savingEdit ? 'Saving...' : 'Save Changes'}
                            </Button>
                        </div>
                    </form>
                ) : null}

                <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <Label className="text-sm text-slate-600">Gallery Photos</Label>
                    <Input
                        value={gallerySearch}
                        onChange={(e) => setGallerySearch(e.target.value)}
                        placeholder="Search captions..."
                        className="md:max-w-sm"
                    />
                </div>
                <div className="mt-6 grid gap-4 md:grid-cols-2">
                    {filteredGallery.length ? filteredGallery.map((item) => (
                        <div
                            key={item.id}
                            className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex items-start gap-3">
                                    <img
                                        src={item.photo_url}
                                        alt={item.caption || 'Gallery photo'}
                                        className="h-16 w-16 rounded-lg object-cover border border-black/10 bg-white"
                                        loading="lazy"
                                    />
                                    <div>
                                        <h3 className="text-base font-heading font-bold">Gallery Item</h3>
                                        {item.caption ? (
                                            <p className="text-xs text-slate-500">{item.caption}</p>
                                        ) : null}
                                        {item.tag ? (
                                            <p className="text-xs uppercase tracking-[0.2em] text-[#b48900]">{item.tag}</p>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => startEdit(item)} className="border-black/10 text-xs">
                                        Edit
                                    </Button>
                                    <Button variant="outline" onClick={() => deleteGalleryItem(item.id)} className="border-black/10 text-xs">
                                        Delete
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )) : (
                        <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4 text-sm text-slate-500">
                            No gallery photos yet.
                        </div>
                    )}
                </div>
                {loading ? (
                    <div className="mt-6 rounded-2xl border border-black/10 bg-white p-6 text-center text-sm text-slate-600">
                        Loading gallery photos...
                    </div>
                ) : null}
            </section>
        </AdminLayout>
    );
}

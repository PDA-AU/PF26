import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { API, uploadGalleryImage } from '@/pages/HomeAdmin/adminApi';

const emptyGalleryItem = {
    photo_url: '',
    caption: '',
    order: 0,
    is_featured: false
};

export default function GalleryAdmin() {
    const { isAdmin, getAuthHeader } = useAuth();
    const [galleryItems, setGalleryItems] = useState([]);
    const [galleryForm, setGalleryForm] = useState(emptyGalleryItem);
    const [galleryPhotoFile, setGalleryPhotoFile] = useState(null);
    const [editingGalleryId, setEditingGalleryId] = useState(null);
    const [savingGallery, setSavingGallery] = useState(false);
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
        if (isAdmin) {
            fetchData();
        }
    }, [isAdmin]);

    const handleGalleryChange = (e) => {
        const { name, value, type, checked } = e.target;
        setGalleryForm(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const resetGalleryForm = () => {
        setGalleryForm(emptyGalleryItem);
        setEditingGalleryId(null);
        setGalleryPhotoFile(null);
    };

    const submitGalleryItem = async (e) => {
        e.preventDefault();
        setSavingGallery(true);
        let photoUrl = galleryForm.photo_url.trim() || null;
        if (galleryPhotoFile) {
            photoUrl = await uploadGalleryImage(galleryPhotoFile, getAuthHeader);
        }
        const payload = {
            photo_url: photoUrl,
            caption: galleryForm.caption.trim() || null,
            order: galleryForm.order ? Number(galleryForm.order) : 0,
            is_featured: galleryForm.is_featured
        };
        try {
            if (editingGalleryId) {
                await axios.put(`${API}/pda-admin/gallery/${editingGalleryId}`, payload, { headers: getAuthHeader() });
            } else {
                await axios.post(`${API}/pda-admin/gallery`, payload, { headers: getAuthHeader() });
            }
            resetGalleryForm();
            fetchData();
        } catch (error) {
            console.error('Failed to save gallery item:', error);
        } finally {
            setSavingGallery(false);
        }
    };

    const editGalleryItem = (item) => {
        setGalleryForm({
            photo_url: item.photo_url || '',
            caption: item.caption || '',
            order: item.order ?? 0,
            is_featured: Boolean(item.is_featured)
        });
        setEditingGalleryId(item.id);
        setGalleryPhotoFile(null);
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
        [item.caption]
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
                    {editingGalleryId ? (
                        <Button variant="outline" onClick={resetGalleryForm} className="border-black/10 text-sm">
                            Cancel Edit
                        </Button>
                    ) : null}
                </div>

                <form onSubmit={submitGalleryItem} className="mt-6 grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                        <Label htmlFor="gallery-photo-url">Photo URL</Label>
                        <Input
                            id="gallery-photo-url"
                            name="photo_url"
                            value={galleryForm.photo_url}
                            onChange={handleGalleryChange}
                            placeholder="https://..."
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Label htmlFor="gallery-photo-file">Or Upload Photo</Label>
                        <Input
                            id="gallery-photo-file"
                            name="gallery_photo_file"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => setGalleryPhotoFile(e.target.files?.[0] || null)}
                        />
                    </div>
                    <div className="md:col-span-2">
                        <Label htmlFor="gallery-caption">Caption</Label>
                        <Textarea
                            id="gallery-caption"
                            name="caption"
                            value={galleryForm.caption}
                            onChange={handleGalleryChange}
                            placeholder="Optional caption"
                            rows={3}
                        />
                    </div>
                    <div>
                        <Label htmlFor="gallery-order">Order</Label>
                        <Input
                            id="gallery-order"
                            name="order"
                            type="number"
                            value={galleryForm.order}
                            onChange={handleGalleryChange}
                            placeholder="0"
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        <input
                            id="gallery-featured"
                            name="is_featured"
                            type="checkbox"
                            checked={galleryForm.is_featured}
                            onChange={handleGalleryChange}
                            className="h-4 w-4"
                        />
                        <Label htmlFor="gallery-featured">Featured</Label>
                    </div>
                    <div className="md:col-span-2 flex justify-end">
                        <Button type="submit" className="bg-[#f6c347] text-black hover:bg-[#ffd16b]" disabled={savingGallery}>
                            {savingGallery ? 'Saving...' : editingGalleryId ? 'Update Photo' : 'Add Photo'}
                        </Button>
                    </div>
                </form>

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
                        <div key={item.id} className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="text-base font-heading font-bold">Gallery Item</h3>
                                    {item.caption ? (
                                        <p className="text-xs text-slate-500">{item.caption}</p>
                                    ) : null}
                                </div>
                                <div className="flex gap-2">
                                    <Button variant="outline" onClick={() => editGalleryItem(item)} className="border-black/10 text-xs">
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

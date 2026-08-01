import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import {
    Upload, ChevronLeft, ChevronRight, FileText,
    ExternalLink, Pencil, Trash2, X, Check,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';

const API = `${import.meta.env.VITE_BACKEND_URL}/api`;
const PAGE_SIZE = 10;

const DEPARTMENTS = [
    'Artificial Intelligence and Data Science',
    'Aerospace Engineering',
    'Automobile Engineering',
    'Computer Technology',
    'Electronics and Communication Engineering',
    'Electronics and Instrumentation Engineering',
    'Production Technology',
    'Robotics and Automation',
    'Rubber and Plastics Technology',
    'Information Technology',
];

const DEPT_SHORT = {
    'Artificial Intelligence and Data Science': 'AI & DS',
    'Aerospace Engineering': 'Aero',
    'Automobile Engineering': 'Auto',
    'Computer Technology': 'CT',
    'Electronics and Communication Engineering': 'ECE',
    'Electronics and Instrumentation Engineering': 'EIE',
    'Production Technology': 'Prod',
    'Robotics and Automation': 'RA',
    'Rubber and Plastics Technology': 'RPT',
    'Information Technology': 'IT',
};

const currentYear = new Date().getFullYear();
const BATCH_YEARS = Array.from({ length: 12 }, (_, i) => String(currentYear - i));

const EXP_LABELS = { intern: 'Internship', placement: 'Placement' };

function extractBatch(regno) {
    if (!regno || regno.length < 4) return null;
    return regno.slice(0, 4);
}

function formatDate(dt) {
    if (!dt) return '';
    return new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PlacementsAdmin() {
    const { getAuthHeader } = useAuth();

    const [placements, setPlacements] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    // Filters
    const [deptFilter, setDeptFilter] = useState('');
    const [batchFilter, setBatchFilter] = useState('');
    const [expTypeFilter, setExpTypeFilter] = useState('');
    const [sortBy, setSortBy] = useState('newest');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    // Upload
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploadForm, setUploadForm] = useState({ experience_type: 'intern', company_name: '', experience_months: '', alias_name: '', alias_regno: '', useDefaultUser: true });
    const [uploadFiles, setUploadFiles] = useState([]); // multiple files
    const [uploading, setUploading] = useState(false);
    const fileInputRef = useRef(null);

    // Edit
    const [editOpen, setEditOpen] = useState(false);
    const [editTarget, setEditTarget] = useState(null);
    const [editForm, setEditForm] = useState({ experience_type: 'intern', company_name: '', experience_months: '', alias_name: '', alias_regno: '' });
    const [editSaving, setEditSaving] = useState(false);

    const debounceRef = useRef(null);

    const handleSearchChange = (val) => {
        setSearch(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(val.trim());
            setPage(1);
        }, 300);
    };

    useEffect(() => { setPage(1); }, [deptFilter, batchFilter, expTypeFilter, sortBy]);

    const fetchPlacements = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page, page_size: PAGE_SIZE };
            if (deptFilter) params.dept = deptFilter;
            if (batchFilter) params.batch = batchFilter;
            if (expTypeFilter) params.experience_type = expTypeFilter;
            if (debouncedSearch) params.q = debouncedSearch;
            if (sortBy) params.sort = sortBy;

            const res = await axios.get(`${API}/pda-admin/placements/`, {
                params,
                headers: getAuthHeader(),
            });
            setPlacements(res.data || []);
            setTotal(Number(res.headers['x-total-count'] || 0));
        } catch {
            toast.error('Failed to load placements');
        } finally {
            setLoading(false);
        }
    }, [page, deptFilter, batchFilter, expTypeFilter, debouncedSearch, sortBy, getAuthHeader]);

    useEffect(() => { fetchPlacements(); }, [fetchPlacements]);

    const handleUpload = async () => {
        if (!uploadFiles.length) return toast.error('Please select at least one file');
        if (!uploadForm.experience_type) return toast.error('Select experience type');
        setUploading(true);
        let successCount = 0;
        try {
            for (const file of uploadFiles) {
                const presignRes = await axios.post(
                    `${API}/pda-admin/placements/presign`,
                    { filename: file.name, content_type: file.type },
                    { headers: getAuthHeader() },
                );
                const { upload_url, public_url, content_type } = presignRes.data;
                await axios.put(upload_url, file, {
                    headers: { 'Content-Type': content_type || file.type },
                });
                const body = {
                    s3_url: public_url,
                    content_type: file.type,
                    experience_type: uploadForm.experience_type,
                    company_name: uploadForm.company_name || null,
                    experience_months: uploadForm.experience_months
                        ? parseInt(uploadForm.experience_months, 10)
                        : null,
                    alias_name: uploadForm.alias_name?.trim() || null,
                    alias_regno: uploadForm.alias_regno?.trim() || null,
                };
                await axios.post(`${API}/pda-admin/placements/`, body, { headers: getAuthHeader() });
                successCount++;
            }
            toast.success(`${successCount} placement${successCount !== 1 ? 's' : ''} uploaded`);
            setUploadOpen(false);
            setUploadFiles([]);
            setUploadForm({ experience_type: 'intern', company_name: '', experience_months: '', alias_name: '', alias_regno: '', useDefaultUser: true });
            fetchPlacements();
        } catch (err) {
            const detail = err?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : `Upload failed after ${successCount} file(s)`);
            if (successCount > 0) fetchPlacements();
        } finally {
            setUploading(false);
        }
    };

    const openEdit = (p) => {
        setEditTarget(p);
        setEditForm({
            experience_type: p.experience_type || 'intern',
            company_name: p.company_name || '',
            experience_months: p.experience_months != null ? String(p.experience_months) : '',
            alias_name: p.alias_name || '',
            alias_regno: p.alias_regno || '',
        });
        setEditOpen(true);
    };

    const handleEditSave = async () => {
        if (!editTarget) return;
        setEditSaving(true);
        try {
            const body = {
                experience_type: editForm.experience_type,
                company_name: editForm.company_name || null,
                experience_months: editForm.experience_months
                    ? parseInt(editForm.experience_months, 10)
                    : null,
                alias_name: editForm.alias_name?.trim() ?? null,
                alias_regno: editForm.alias_regno?.trim() ?? null,
            };
            await axios.put(`${API}/pda-admin/placements/${editTarget.id}`, body, { headers: getAuthHeader() });
            toast.success('Updated successfully');
            setEditOpen(false);
            setEditTarget(null);
            fetchPlacements();
        } catch (err) {
            const detail = err?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Update failed');
        } finally {
            setEditSaving(false);
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Delete this placement entry? This cannot be undone.')) return;
        try {
            await axios.delete(`${API}/pda-admin/placements/${id}`, { headers: getAuthHeader() });
            toast.success('Deleted');
            fetchPlacements();
        } catch {
            toast.error('Delete failed');
        }
    };

    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, total);

    return (
        <AdminLayout title="Placements" subtitle="Manage internship and placement experience files">
            {/* Upload section */}
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm space-y-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-heading font-black">Upload Experience</h2>
                        <p className="text-xs text-slate-400 mt-0.5">File uploads use default user (0000000000)</p>
                    </div>
                    <Button
                        onClick={() => setUploadOpen(true)}
                        className="bg-[#f6c347] text-black hover:bg-[#ffd16b] transition-colors duration-200 font-semibold flex items-center gap-2 shrink-0"
                    >
                        <Upload className="w-4 h-4" />
                        Upload File
                    </Button>
                </div>
            </section>

            {/* Filters */}
            <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                    <Select value={deptFilter} onValueChange={v => setDeptFilter(v === '__all__' ? '' : v)}>
                        <SelectTrigger className="w-full sm:w-52 border-black/10 text-sm">
                            <SelectValue placeholder="All Departments" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All Departments</SelectItem>
                            {DEPARTMENTS.map(d => (
                                <SelectItem key={d} value={d}>{DEPT_SHORT[d] || d}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={batchFilter} onValueChange={v => setBatchFilter(v === '__all__' ? '' : v)}>
                        <SelectTrigger className="w-full sm:w-36 border-black/10 text-sm">
                            <SelectValue placeholder="All Batches" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All Batches</SelectItem>
                            {BATCH_YEARS.map(y => (
                                <SelectItem key={y} value={y}>{y}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    <Select value={expTypeFilter} onValueChange={v => setExpTypeFilter(v === '__all__' ? '' : v)}>
                        <SelectTrigger className="w-full sm:w-40 border-black/10 text-sm">
                            <SelectValue placeholder="All Types" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All Types</SelectItem>
                            <SelectItem value="intern">Internship</SelectItem>
                            <SelectItem value="placement">Placement</SelectItem>
                        </SelectContent>
                    </Select>

                    <Select value={sortBy} onValueChange={setSortBy}>
                        <SelectTrigger className="w-full sm:w-40 border-black/10 text-sm">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="newest">Newest First</SelectItem>
                            <SelectItem value="oldest">Oldest First</SelectItem>
                            <SelectItem value="company">Company A–Z</SelectItem>
                        </SelectContent>
                    </Select>

                    <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
                        <Input
                            value={search}
                            onChange={e => handleSearchChange(e.target.value)}
                            placeholder="Search keyword…"
                            className="border-black/10 text-sm pr-8"
                        />
                        {search && (
                            <button
                                onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black transition-colors"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                    </div>
                </div>
            </section>

            {/* Results count */}
            {total > 0 && (
                <p className="text-xs text-slate-400 -mt-4">
                    Showing {start}–{end} of {total} entr{total !== 1 ? 'ies' : 'y'}
                </p>
            )}

            {/* Grid */}
            {loading ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="rounded-2xl border border-black/10 bg-white p-4 h-44 animate-pulse" />
                    ))}
                </div>
            ) : placements.length === 0 ? (
                <div className="rounded-2xl border border-black/10 bg-white p-12 text-center text-slate-400">
                    <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No placements found</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {placements.map(p => (
                        <AdminPlacementCard
                            key={p.id}
                            placement={p}
                            onEdit={() => openEdit(p)}
                            onDelete={() => handleDelete(p.id)}
                        />
                    ))}
                </div>
            )}

            {/* Pagination */}
            {total > PAGE_SIZE && (
                <div className="flex items-center justify-center gap-3 pt-2">
                    <button
                        onClick={() => setPage(v => Math.max(1, v - 1))}
                        disabled={page === 1}
                        className="rounded-full border border-[#c99612] bg-[#f6c347] p-2 text-[#11131a] transition-colors duration-200 hover:bg-[#ffd16b] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-medium">Page {page} / {totalPages}</span>
                    <button
                        onClick={() => setPage(v => v + 1)}
                        disabled={page >= totalPages}
                        className="rounded-full border border-[#c99612] bg-[#f6c347] p-2 text-[#11131a] transition-colors duration-200 hover:bg-[#ffd16b] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}

            {/* Upload Dialog */}
            <Dialog open={uploadOpen} onOpenChange={v => { setUploadOpen(v); if (!v) setUploadFiles([]); }}>
                <DialogContent className="bg-white rounded-2xl w-full max-w-md sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-black text-xl">Upload Placement File</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">File (PDF or DOCX)</Label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors duration-200 ${
                                    uploadFiles.length > 0
                                        ? 'border-[#c99612] bg-[#fffdf7]'
                                        : 'border-black/20 hover:border-[#c99612] hover:bg-[#fffdf7]'
                                }`}
                            >
                                {uploadFiles.length > 0 ? (
                                    <div className="space-y-1 text-left">
                                        {uploadFiles.map((f, i) => (
                                            <div key={i} className="flex items-center gap-2 text-sm">
                                                <FileText className="w-4 h-4 text-[#b48900] shrink-0" />
                                                <span className="font-medium truncate flex-1">{f.name}</span>
                                                <button
                                                    onClick={e => { e.stopPropagation(); setUploadFiles(prev => prev.filter((_, j) => j !== i)); }}
                                                    className="text-slate-400 hover:text-black transition-colors shrink-0"
                                                >
                                                    <X className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        ))}
                                        <p className="text-xs text-slate-400 pt-1">Click to add more files</p>
                                    </div>
                                ) : (
                                    <div className="text-slate-400 text-sm">
                                        <Upload className="w-6 h-6 mx-auto mb-1 opacity-50" />
                                        Click to select PDF or DOCX (multiple allowed)
                                    </div>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                    className="hidden"
                                    onChange={e => {
                                        const selected = Array.from(e.target.files || []);
                                        setUploadFiles(prev => [...prev, ...selected]);
                                        e.target.value = '';
                                    }}
                                />
                            </div>
                        </div>

                        {/* Alias name + regno */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label className="font-semibold text-sm">Display Name</Label>
                                <Input
                                    value={uploadForm.alias_name}
                                    onChange={e => setUploadForm(f => ({ ...f, alias_name: e.target.value }))}
                                    placeholder="Student name"
                                    className="border-black/10"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="font-semibold text-sm">Register No.</Label>
                                <Input
                                    value={uploadForm.alias_regno}
                                    onChange={e => setUploadForm(f => ({ ...f, alias_regno: e.target.value }))}
                                    placeholder="e.g. 211019104001"
                                    className="border-black/10"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">Type</Label>
                            <Select
                                value={uploadForm.experience_type}
                                onValueChange={v => setUploadForm(f => ({ ...f, experience_type: v }))}
                            >
                                <SelectTrigger className="border-black/10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="intern">Internship</SelectItem>
                                    <SelectItem value="placement">Placement</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">Company Name</Label>
                            <Input
                                value={uploadForm.company_name}
                                onChange={e => setUploadForm(f => ({ ...f, company_name: e.target.value }))}
                                placeholder="e.g. Google, TCS, Zoho"
                                className="border-black/10"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">Duration (months)</Label>
                            <Input
                                type="number"
                                min={1}
                                value={uploadForm.experience_months}
                                onChange={e => setUploadForm(f => ({ ...f, experience_months: e.target.value }))}
                                placeholder="e.g. 6"
                                className="border-black/10"
                            />
                        </div>

                        <div className="flex items-center gap-2 p-3 rounded-xl bg-[#fffdf7] border border-[#c99612]/30">
                            <Check className="w-4 h-4 text-[#b48900] shrink-0" />
                            <p className="text-xs text-[#8b6a00]">
                                This file will be attributed to the default user (0000000000)
                            </p>
                        </div>

                        <Button
                            onClick={handleUpload}
                            disabled={uploading}
                            className="w-full bg-[#11131a] text-white hover:bg-[#1f2330] transition-colors duration-200 font-semibold"
                        >
                            {uploading
                                ? `Uploading ${uploadFiles.length} file${uploadFiles.length !== 1 ? 's' : ''}…`
                                : uploadFiles.length > 1
                                    ? `Upload ${uploadFiles.length} Files`
                                    : 'Upload'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="bg-white rounded-2xl w-full max-w-md">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-black text-xl">Edit Placement</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                        {/* Alias name + regno */}
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                                <Label className="font-semibold text-sm">Display Name</Label>
                                <Input
                                    value={editForm.alias_name}
                                    onChange={e => setEditForm(f => ({ ...f, alias_name: e.target.value }))}
                                    placeholder="Student name"
                                    className="border-black/10"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="font-semibold text-sm">Register No.</Label>
                                <Input
                                    value={editForm.alias_regno}
                                    onChange={e => setEditForm(f => ({ ...f, alias_regno: e.target.value }))}
                                    placeholder="e.g. 211019104001"
                                    className="border-black/10"
                                />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">Type</Label>
                            <Select
                                value={editForm.experience_type}
                                onValueChange={v => setEditForm(f => ({ ...f, experience_type: v }))}
                            >
                                <SelectTrigger className="border-black/10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="intern">Internship</SelectItem>
                                    <SelectItem value="placement">Placement</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">Company Name</Label>
                            <Input
                                value={editForm.company_name}
                                onChange={e => setEditForm(f => ({ ...f, company_name: e.target.value }))}
                                placeholder="Company name"
                                className="border-black/10"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">Duration (months)</Label>
                            <Input
                                type="number"
                                min={1}
                                value={editForm.experience_months}
                                onChange={e => setEditForm(f => ({ ...f, experience_months: e.target.value }))}
                                placeholder="e.g. 6"
                                className="border-black/10"
                            />
                        </div>

                        <div className="flex gap-2">
                            <Button
                                onClick={handleEditSave}
                                disabled={editSaving}
                                className="flex-1 bg-[#11131a] text-white hover:bg-[#1f2330] transition-colors duration-200 font-semibold"
                            >
                                {editSaving ? 'Saving…' : 'Save Changes'}
                            </Button>
                            <Button
                                variant="outline"
                                onClick={() => setEditOpen(false)}
                                className="border-black/10"
                            >
                                Cancel
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>
        </AdminLayout>
    );
}

function AdminPlacementCard({ placement: p, onEdit, onDelete }) {
    const batch = extractBatch(p.uploader_regno);
    const isIntern = p.experience_type === 'intern';

    return (
        <div className="rounded-2xl border border-black/10 bg-[#fffdf7] p-4 shadow-sm flex flex-col gap-2 hover:shadow-md transition-shadow duration-200">
            <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-base leading-snug line-clamp-2 flex-1">
                    {p.company_name || 'Company N/A'}
                </span>
                <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${
                    isIntern ? 'bg-[#fff3c4] text-[#b8890b]' : 'bg-[#11131a] text-[#f6c347]'
                }`}>
                    {EXP_LABELS[p.experience_type] || p.experience_type}
                </span>
            </div>

            <p className="text-sm text-slate-600 font-medium">{p.uploader_name || 'Anonymous'}</p>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                {p.uploader_dept && <span>{DEPT_SHORT[p.uploader_dept] || p.uploader_dept}</span>}
                {batch && <span>Batch {batch}</span>}
                {p.experience_months && <span>{p.experience_months} mo</span>}
            </div>

            <a
                href={p.s3_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[#b48900] hover:text-[#8b6a00] transition-colors duration-150 underline underline-offset-2"
            >
                <ExternalLink className="w-3 h-3" />
                View File
            </a>

            <p className="text-xs text-slate-400">{formatDate(p.created_at)}</p>

            {/* Admin actions */}
            <div className="flex gap-2 pt-1 border-t border-black/5 mt-auto">
                <button
                    onClick={onEdit}
                    className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-[#11131a] transition-colors duration-150 px-2 py-1 rounded-lg hover:bg-black/5"
                >
                    <Pencil className="w-3.5 h-3.5" />
                    Edit
                </button>
                <button
                    onClick={onDelete}
                    className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-600 transition-colors duration-150 px-2 py-1 rounded-lg hover:bg-red-50"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                </button>
            </div>
        </div>
    );
}

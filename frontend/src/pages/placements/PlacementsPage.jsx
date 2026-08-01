import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { Upload, ChevronLeft, ChevronRight, FileText, ExternalLink, X, Eye, EyeOff, LogIn } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
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
import PdaHeader from '@/components/layout/PdaHeader';
import PdaFooter from '@/components/layout/PdaFooter';

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

const EXP_LABELS = {
    intern: 'Internship',
    placement: 'Placement',
};

function extractBatch(regno) {
    if (!regno || regno.length < 4) return null;
    return regno.slice(0, 4);
}

function formatDate(dt) {
    if (!dt) return '';
    return new Date(dt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PlacementsPage() {
    const { getAuthHeader, user, login } = useAuth();

    const [placements, setPlacements] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    const [deptFilter, setDeptFilter] = useState('');
    const [batchFilter, setBatchFilter] = useState('');
    const [expTypeFilter, setExpTypeFilter] = useState('');
    const [sortBy, setSortBy] = useState('newest');
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');

    const [keywords, setKeywords] = useState({});

    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploadForm, setUploadForm] = useState({
        experience_type: 'intern',
        company_name: '',
        experience_months: '',
    });
    const [uploadFile, setUploadFile] = useState(null);
    const [uploading, setUploading] = useState(false);

    const [loginOpen, setLoginOpen] = useState(false);
    const [loginForm, setLoginForm] = useState({ regno: '', password: '' });
    const [loginLoading, setLoginLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const debounceRef = useRef(null);
    const fileInputRef = useRef(null);

    // Debounce search
    const handleSearchChange = (val) => {
        setSearch(val);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(val.trim());
            setPage(1);
        }, 300);
    };

    // Reset page on filter changes
    useEffect(() => { setPage(1); }, [deptFilter, batchFilter, expTypeFilter, sortBy]);

    // Fetch keyword suggestions
    useEffect(() => {
        axios.get(`${API}/placements/keywords`)
            .then(res => setKeywords(res.data?.keywords || {}))
            .catch(() => {});
    }, []);

    const fetchPlacements = useCallback(async () => {
        setLoading(true);
        try {
            const params = { page, page_size: PAGE_SIZE };
            if (deptFilter) params.dept = deptFilter;
            if (batchFilter) params.batch = batchFilter;
            if (expTypeFilter) params.experience_type = expTypeFilter;
            if (debouncedSearch) params.q = debouncedSearch;
            if (sortBy) params.sort = sortBy;

            const res = await axios.get(`${API}/placements/`, {
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

    const handleLoginSubmit = async (e) => {
        e.preventDefault();
        setLoginLoading(true);
        try {
            await login(loginForm.regno, loginForm.password);
            toast.success('Logged in!');
            setLoginOpen(false);
            setLoginForm({ regno: '', password: '' });
            setUploadOpen(true);
        } catch (err) {
            const detail = err?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Login failed. Check your credentials.');
        } finally {
            setLoginLoading(false);
        }
    };

    const handleUpload = async () => {
        if (!uploadFile) return toast.error('Please select a file');
        if (!uploadForm.experience_type) return toast.error('Select experience type');
        setUploading(true);
        try {
            const presignRes = await axios.post(
                `${API}/placements/presign`,
                { filename: uploadFile.name, content_type: uploadFile.type },
                { headers: getAuthHeader() },
            );
            const { upload_url, public_url, content_type } = presignRes.data;
            await axios.put(upload_url, uploadFile, {
                headers: { 'Content-Type': content_type || uploadFile.type },
            });
            await axios.post(
                `${API}/placements/`,
                {
                    s3_url: public_url,
                    content_type: uploadFile.type,
                    experience_type: uploadForm.experience_type,
                    company_name: uploadForm.company_name || null,
                    experience_months: uploadForm.experience_months
                        ? parseInt(uploadForm.experience_months, 10)
                        : null,
                },
                { headers: getAuthHeader() },
            );
            toast.success('Experience uploaded successfully!');
            setUploadOpen(false);
            setUploadFile(null);
            setUploadForm({ experience_type: 'intern', company_name: '', experience_months: '' });
            fetchPlacements();
        } catch (err) {
            const detail = err?.response?.data?.detail;
            toast.error(typeof detail === 'string' ? detail : 'Upload failed. Please try again.');
        } finally {
            setUploading(false);
        }
    };

    const activeKeywords = deptFilter ? (keywords[deptFilter] || []) : [];
    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    const start = (page - 1) * PAGE_SIZE + 1;
    const end = Math.min(page * PAGE_SIZE, total);

    return (
        <div className="min-h-screen bg-[#f7f5f0] text-[#0f1115]">
            <PdaHeader />

            <main>
                <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-5 sm:py-10 space-y-6">

                    {/* Page title + Upload button */}
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-slate-400 mb-1">PDA</p>
                            <h1 className="text-3xl font-heading font-black">Placements</h1>
                            <p className="mt-1 text-sm text-slate-500">
                                Browse internship and placement experiences shared by students
                            </p>
                        </div>
                        <Button
                            onClick={() => user ? setUploadOpen(true) : setLoginOpen(true)}
                            className="bg-[#f6c347] text-black hover:bg-[#ffd16b] transition-colors duration-200 font-semibold flex items-center gap-2 shrink-0"
                        >
                            <Upload className="w-4 h-4" />
                            Share Experience
                        </Button>
                    </div>

                    {/* Filters */}
                    <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm space-y-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                            {/* Dept filter */}
                            <Select value={deptFilter} onValueChange={(v) => setDeptFilter(v === '__all__' ? '' : v)}>
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

                            {/* Batch filter */}
                            <Select value={batchFilter} onValueChange={(v) => setBatchFilter(v === '__all__' ? '' : v)}>
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

                            {/* Experience type filter */}
                            <Select value={expTypeFilter} onValueChange={(v) => setExpTypeFilter(v === '__all__' ? '' : v)}>
                                <SelectTrigger className="w-full sm:w-40 border-black/10 text-sm">
                                    <SelectValue placeholder="All Types" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All Types</SelectItem>
                                    <SelectItem value="intern">Internship</SelectItem>
                                    <SelectItem value="placement">Placement</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Sort */}
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

                            {/* Search */}
                            <div className="relative flex-1 min-w-0 sm:min-w-[200px]">
                                <Input
                                    value={search}
                                    onChange={e => handleSearchChange(e.target.value)}
                                    placeholder="Search by keyword…"
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

                        {/* Keyword chips */}
                        {activeKeywords.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-1 border-t border-black/5">
                                <span className="text-xs text-slate-400 self-center">Quick search:</span>
                                {activeKeywords.map(kw => (
                                    <button
                                        key={kw}
                                        onClick={() => {
                                            setSearch(kw);
                                            setDebouncedSearch(kw);
                                            setPage(1);
                                        }}
                                        className={`px-3 py-1 rounded-full text-xs border transition-all duration-150 ${
                                            debouncedSearch === kw
                                                ? 'bg-[#11131a] text-[#f6c347] border-[#c99612]'
                                                : 'border-black/20 bg-white text-slate-600 hover:border-black/40 hover:bg-[#fffdf7]'
                                        }`}
                                    >
                                        {kw}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Results info */}
                    {total > 0 && (
                        <p className="text-xs text-slate-400">
                            Showing {start}–{end} of {total} experience{total !== 1 ? 's' : ''}
                        </p>
                    )}

                    {/* Grid */}
                    {loading ? (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="rounded-2xl border border-black/10 bg-white p-4 h-40 animate-pulse" />
                            ))}
                        </div>
                    ) : placements.length === 0 ? (
                        <div className="rounded-2xl border border-black/10 bg-white p-12 text-center text-slate-400">
                            <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No experiences found</p>
                            {debouncedSearch && (
                                <button
                                    onClick={() => { setSearch(''); setDebouncedSearch(''); setPage(1); }}
                                    className="mt-2 text-xs underline hover:text-black transition-colors"
                                >
                                    Clear search
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                            {placements.map(p => (
                                <PlacementCard key={p.id} placement={p} />
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
                            <span className="text-sm font-medium">
                                Page {page} / {totalPages}
                            </span>
                            <button
                                onClick={() => setPage(v => v + 1)}
                                disabled={page >= totalPages}
                                className="rounded-full border border-[#c99612] bg-[#f6c347] p-2 text-[#11131a] transition-colors duration-200 hover:bg-[#ffd16b] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    )}
                </div>
            </main>

            <PdaFooter />

            {/* Login Modal */}
            <Dialog open={loginOpen} onOpenChange={v => { setLoginOpen(v); if (!v) setLoginForm({ regno: '', password: '' }); }}>
                <DialogContent className="bg-white rounded-2xl w-full max-w-sm">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-black text-xl flex items-center gap-2">
                            <LogIn className="w-5 h-5 text-[#b48900]" />
                            Login to Share
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-slate-500 -mt-2">Sign in with your PDA account to upload your experience.</p>
                    <form onSubmit={handleLoginSubmit} className="space-y-4 mt-1">
                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">Register Number</Label>
                            <Input
                                value={loginForm.regno}
                                onChange={e => setLoginForm(f => ({ ...f, regno: e.target.value }))}
                                placeholder="e.g. 211019104001"
                                required
                                autoFocus
                                className="border-black/10"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">Password</Label>
                            <div className="relative">
                                <Input
                                    type={showPassword ? 'text' : 'password'}
                                    value={loginForm.password}
                                    onChange={e => setLoginForm(f => ({ ...f, password: e.target.value }))}
                                    placeholder="Enter your password"
                                    required
                                    className="border-black/10 pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(v => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-black transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                        <Button
                            type="submit"
                            disabled={loginLoading}
                            className="w-full bg-[#f6c347] text-black hover:bg-[#ffd16b] transition-colors duration-200 font-semibold"
                        >
                            {loginLoading ? 'Logging in…' : 'Login & Continue'}
                        </Button>
                        <p className="text-center text-xs text-slate-400">
                            Don't have an account?{' '}
                            <a href="/signup" className="text-[#b48900] hover:underline font-medium">Sign up</a>
                        </p>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Upload Dialog */}
            <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                <DialogContent className="bg-white rounded-2xl w-full max-w-md sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="font-heading font-black text-xl">Share Your Experience</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-2">
                        {/* File input */}
                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">File (PDF or DOCX)</Label>
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className={`cursor-pointer rounded-xl border-2 border-dashed p-5 text-center transition-colors duration-200 ${
                                    uploadFile
                                        ? 'border-[#c99612] bg-[#fffdf7]'
                                        : 'border-black/20 hover:border-[#c99612] hover:bg-[#fffdf7]'
                                }`}
                            >
                                {uploadFile ? (
                                    <div className="flex items-center justify-center gap-2 text-sm">
                                        <FileText className="w-5 h-5 text-[#b48900]" />
                                        <span className="font-medium truncate max-w-xs">{uploadFile.name}</span>
                                        <button
                                            onClick={e => { e.stopPropagation(); setUploadFile(null); }}
                                            className="text-slate-400 hover:text-black transition-colors"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="text-slate-400 text-sm">
                                        <Upload className="w-6 h-6 mx-auto mb-1 opacity-50" />
                                        Click to select PDF or DOCX
                                    </div>
                                )}
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                    className="hidden"
                                    onChange={e => setUploadFile(e.target.files?.[0] || null)}
                                />
                            </div>
                        </div>

                        {/* Experience type */}
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

                        {/* Company name */}
                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">Company Name</Label>
                            <Input
                                value={uploadForm.company_name}
                                onChange={e => setUploadForm(f => ({ ...f, company_name: e.target.value }))}
                                placeholder="e.g. Google, TCS, Zoho"
                                className="border-black/10"
                            />
                        </div>

                        {/* Experience months */}
                        <div className="space-y-1.5">
                            <Label className="font-semibold text-sm">Duration (months)</Label>
                            <Input
                                type="number"
                                min={1}
                                value={uploadForm.experience_months}
                                onChange={e => setUploadForm(f => ({ ...f, experience_months: e.target.value }))}
                                placeholder="e.g. 2"
                                className="border-black/10"
                            />
                        </div>

                        <Button
                            onClick={handleUpload}
                            disabled={uploading}
                            className="w-full bg-[#f6c347] text-black hover:bg-[#ffd16b] transition-colors duration-200 font-semibold"
                        >
                            {uploading ? 'Uploading…' : 'Upload'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function PlacementCard({ placement: p }) {
    const batch = extractBatch(p.uploader_regno);
    const isIntern = p.experience_type === 'intern';

    return (
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm flex flex-col gap-2 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
            <div className="flex items-start justify-between gap-2">
                <span className="font-semibold text-base leading-snug line-clamp-2 flex-1">
                    {p.company_name || 'Company N/A'}
                </span>
                <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${
                    isIntern
                        ? 'bg-[#fff3c4] text-[#b8890b]'
                        : 'bg-[#11131a] text-[#f6c347]'
                }`}>
                    {EXP_LABELS[p.experience_type] || p.experience_type}
                </span>
            </div>

            <p className="text-sm text-slate-600 font-medium">
                {p.uploader_name || 'Anonymous'}
            </p>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                {p.uploader_dept && <span>{DEPT_SHORT[p.uploader_dept] || p.uploader_dept}</span>}
                {batch && <span>Batch {batch}</span>}
                {p.experience_months && <span>{p.experience_months} mo</span>}
            </div>

            <a
                href={p.s3_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1.5 text-xs text-[#b48900] hover:text-[#8b6a00] transition-colors duration-150 underline underline-offset-2"
            >
                <ExternalLink className="w-3 h-3" />
                View Experience
            </a>

            <p className="text-xs text-slate-400 mt-auto">{formatDate(p.created_at)}</p>
        </div>
    );
}

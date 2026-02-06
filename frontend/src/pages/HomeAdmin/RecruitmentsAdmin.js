import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/context/AuthContext';
import AdminLayout from '@/pages/HomeAdmin/AdminLayout';
import { API } from '@/pages/HomeAdmin/adminApi';

export default function RecruitmentsAdmin() {
    const { user, getAuthHeader } = useAuth();
    const [recruitments, setRecruitments] = useState([]);
    const [selectedRecruitments, setSelectedRecruitments] = useState([]);

    const fetchRecruitments = useCallback(async () => {
        try {
            const res = await axios.get(`${API}/pda-admin/recruitments`, { headers: getAuthHeader() });
            setRecruitments(res.data || []);
        } catch (error) {
            console.error('Failed to load recruitments:', error);
        }
    }, [getAuthHeader]);

    useEffect(() => {
        if (user?.is_superadmin) {
            fetchRecruitments();
        }
    }, [user, fetchRecruitments]);

    const toggleRecruitment = (id) => {
        setSelectedRecruitments(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
    };

    const approveRecruitments = async () => {
        if (selectedRecruitments.length === 0) return;
        try {
            await axios.post(`${API}/pda-admin/recruitments/approve`, selectedRecruitments, { headers: getAuthHeader() });
            setSelectedRecruitments([]);
            fetchRecruitments();
        } catch (error) {
            console.error('Failed to approve recruitments:', error);
        }
    };

    if (!user?.is_superadmin) {
        return (
            <AdminLayout title="Recruitments" subtitle="Access restricted to the superadmin account.">
                <div className="rounded-3xl border border-black/10 bg-white p-8 text-center text-sm text-slate-600">
                    You do not have permission to view this page.
                </div>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout title="Recruitments" subtitle="Review and approve PDA recruitment applications.">
            <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <p className="text-xs uppercase tracking-[0.4em] text-slate-400">Recruitments</p>
                        <h2 className="text-2xl font-heading font-black">Pending Applications</h2>
                    </div>
                    <Button onClick={approveRecruitments} className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">
                        Approve Selected
                    </Button>
                </div>
                <div className="mt-6 space-y-3">
                    {recruitments.map((recruit) => (
                        <label key={recruit.id} className="flex items-start gap-4 rounded-2xl border border-black/10 p-4">
                            <input
                                type="checkbox"
                                checked={selectedRecruitments.includes(recruit.id)}
                                onChange={() => toggleRecruitment(recruit.id)}
                                className="mt-1"
                            />
                            <div>
                                <p className="font-semibold">{recruit.name} ({recruit.regno})</p>
                                <p className="text-xs text-slate-500">
                                    {recruit.email} · {recruit.phno || 'No phone'} · DOB: {recruit.dob || 'N/A'}
                                </p>
                                <p className="text-xs text-slate-500">
                                    Preferred: {recruit.preferred_team || 'N/A'} · Dept: {recruit.dept || 'N/A'}
                                </p>
                            </div>
                        </label>
                    ))}
                    {recruitments.length === 0 && (
                        <div className="text-sm text-slate-500">No pending applications.</div>
                    )}
                </div>
            </section>
        </AdminLayout>
    );
}

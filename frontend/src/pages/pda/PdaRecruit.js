import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import PdaHeader from '@/components/layout/PdaHeader';

const DEPARTMENTS = [
    { value: "Artificial Intelligence and Data Science", label: "AI & Data Science" },
    { value: "Aerospace Engineering", label: "Aerospace Engineering" },
    { value: "Automobile Engineering", label: "Automobile Engineering" },
    { value: "Computer Technology", label: "Computer Technology" },
    { value: "Electronics and Communication Engineering", label: "ECE" },
    { value: "Electronics and Instrumentation Engineering", label: "EIE" },
    { value: "Production Technology", label: "Production Technology" },
    { value: "Robotics and Automation", label: "Robotics & Automation" },
    { value: "Rubber and Plastics Technology", label: "Rubber & Plastics" },
    { value: "Information Technology", label: "Information Technology" }
];

const TEAMS = [
    'Content Creation',
    'Event Management',
    'Design',
    'Website Design',
    'Public Relations',
    'Podcast',
    'Library'
];

export default function PdaRecruit() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [formData, setFormData] = useState({
        name: '',
        regno: '',
        email: '',
        dob: '',
        phno: '',
        dept: '',
        password: '',
        preferred_team: ''
    });
    const [loading, setLoading] = useState(false);

    const getErrorMessage = (error, fallback) => {
        const detail = error?.response?.data?.detail;
        if (Array.isArray(detail)) {
            return detail.map((item) => item?.msg || item?.detail || JSON.stringify(item)).join(', ');
        }
        if (detail && typeof detail === 'object') {
            return detail.msg || detail.detail || JSON.stringify(detail);
        }
        return detail || fallback;
    };

    const handleChange = (e) => {
        setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await register({
                ...formData,
                preferred_team: formData.preferred_team || undefined
            });
            toast.success('Application submitted successfully!');
            navigate('/pda/profile');
        } catch (error) {
            console.error('Recruitment failed:', error);
            toast.error(getErrorMessage(error, 'Failed to submit application'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f7f5f0] flex flex-col">
            <PdaHeader />
            <div className="mx-auto w-full max-w-4xl px-5 py-10 flex-1">
                <Link to="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-black mb-6">
                    <ArrowLeft className="w-5 h-5" /> Back to Home
                </Link>

                <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="h-12 w-12 rounded-2xl bg-[#11131a] text-[#f6c347] flex items-center justify-center">
                            <Sparkles className="w-6 h-6" />
                        </div>
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">PDA Recruitment</p>
                            <h1 className="text-3xl font-heading font-black">Join the PDA Team</h1>
                        </div>
                    </div>

                    <form onSubmit={handleSubmit} className="mt-8 grid gap-4 md:grid-cols-2">
                        <div>
                            <Label htmlFor="name">Name</Label>
                            <Input id="name" name="name" value={formData.name} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="regno">Register Number</Label>
                            <Input id="regno" name="regno" value={formData.regno} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" name="email" type="email" value={formData.email} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="dob">Date of Birth</Label>
                            <Input id="dob" name="dob" type="date" value={formData.dob} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="phno">Phone</Label>
                            <Input id="phno" name="phno" value={formData.phno} onChange={handleChange} required />
                        </div>
                        <div>
                            <Label htmlFor="dept">Department</Label>
                            <Select value={formData.dept} onValueChange={(value) => setFormData(prev => ({ ...prev, dept: value }))}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select department" />
                                </SelectTrigger>
                                <SelectContent>
                                    {DEPARTMENTS.map(dept => (
                                        <SelectItem key={dept.value} value={dept.value}>{dept.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" name="password" type="password" value={formData.password} onChange={handleChange} required minLength={6} />
                        </div>
                        <div className="md:col-span-2">
                            <Label>Preferred Team</Label>
                            <Select value={formData.preferred_team} onValueChange={(value) => setFormData(prev => ({ ...prev, preferred_team: value }))}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select a team" />
                                </SelectTrigger>
                                <SelectContent>
                                    {TEAMS.map(team => (
                                        <SelectItem key={team} value={team}>{team}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="md:col-span-2 flex justify-end">
                            <Button type="submit" disabled={loading} className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">
                                {loading ? 'Submitting...' : 'Submit Application'}
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

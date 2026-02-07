import React, { useEffect, useState } from 'react';
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

const GENDERS = [
    { value: 'Male', label: 'Male' },
    { value: 'Female', label: 'Female' }
];

const WHATSAPP_CHANNEL_URL = "https://whatsapp.com/channel/your-channel-id";

export default function PdaRecruit() {
    const navigate = useNavigate();
    const { register } = useAuth();
    const [formData, setFormData] = useState({
        name: '',
        regno: '',
        email: '',
        dob: '',
        gender: '',
        phno: '',
        dept: '',
        password: '',
        preferred_team: ''
    });
    const [loading, setLoading] = useState(false);
    const [recruitmentOpen, setRecruitmentOpen] = useState(true);
    const [whatsappJoined, setWhatsappJoined] = useState(false);

    useEffect(() => {
        const fetchRecruitmentStatus = async () => {
            try {
                const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/pda/recruitment-status`);
                const data = await res.json();
                if (typeof data?.recruitment_open === 'boolean') {
                    setRecruitmentOpen(data.recruitment_open);
                }
            } catch (error) {
                console.error('Failed to load recruitment status:', error);
            }
        };
        fetchRecruitmentStatus();
    }, []);

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
        if (!recruitmentOpen) {
            toast.error('Recruitment is currently paused');
            return;
        }
        if (!formData.gender) {
            toast.error('Please select gender');
            return;
        }
        setLoading(true);
        try {
            const result = await register({
                ...formData,
                preferred_team: formData.preferred_team || undefined
            });
            if (result?.status === 'verification_required') {
                toast.success('Check your email to verify your account, then log in.');
                navigate('/login');
                return;
            }
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
                       
                        <div>
                            <p className="text-xs uppercase tracking-[0.4em] text-slate-400">PDA Recruitment</p>
                            <h1 className="text-3xl font-heading font-black">Join the PDA Team</h1>
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                        {!recruitmentOpen ? (
                            <span className="inline-flex items-center rounded-full border border-[#c99612] bg-[#fff3c4] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#7a5a00]">
                                Recruitment paused
                            </span>
                        ) : null}
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
                            <Label htmlFor="gender">Gender</Label>
                            <Select value={formData.gender} onValueChange={(value) => setFormData(prev => ({ ...prev, gender: value }))}>
                                <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Select gender" />
                                </SelectTrigger>
                                <SelectContent>
                                    {GENDERS.map(gender => (
                                        <SelectItem key={gender.value} value={gender.value}>{gender.label}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
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

                        <div className="md:col-span-2 flex flex-col gap-4">
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <a
                                    href={WHATSAPP_CHANNEL_URL}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center justify-center gap-2 rounded-md border border-black/10 bg-[#11131a] px-4 py-2 text-sm font-semibold text-[#f6c347] transition-colors hover:bg-[#f6c347] hover:text-[#11131a]"
                                >
                                    Join our WhatsApp channel
                                </a>
                                <div className="flex items-center gap-2">
                                    <input
                                        id="whatsapp_joined"
                                        type="checkbox"
                                        checked={whatsappJoined}
                                        onChange={(e) => setWhatsappJoined(e.target.checked)}
                                        className="h-4 w-4"
                                        required
                                    />
                                    <Label htmlFor="whatsapp_joined" className="text-sm text-slate-700">
                                        I have joined the WhatsApp channel
                                    </Label>
                                </div>
                            </div>
                            <div className="flex justify-end">
                                <Button type="submit" disabled={loading || !recruitmentOpen || !whatsappJoined} className="bg-[#f6c347] text-black hover:bg-[#ffd16b]">
                                    {loading ? 'Submitting...' : 'Submit Application'}
                                </Button>
                            </div>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}

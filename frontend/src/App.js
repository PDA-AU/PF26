import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { ParticipantAuthProvider, useParticipantAuth } from "@/context/ParticipantAuthContext";

// Pages
import PersofestHome from "@/pages/persofest/PersofestHome";
import PdaHome from "@/pages/PdaHome";
import ItemsAdmin from "@/pages/HomeAdmin/ItemsAdmin";
import TeamAdmin from "@/pages/HomeAdmin/TeamAdmin";
import GalleryAdmin from "@/pages/HomeAdmin/GalleryAdmin";
import SuperAdmin from "@/pages/HomeAdmin/SuperAdmin";
import LogsAdmin from "@/pages/HomeAdmin/LogsAdmin";
import RecruitmentsAdmin from "@/pages/HomeAdmin/RecruitmentsAdmin";
import LoginPage from "@/pages/persofest/LoginPage";
import RegisterPage from "@/pages/persofest/RegisterPage";
import PdaLogin from "@/pages/pda/PdaLogin";
import PdaRecruit from "@/pages/pda/PdaRecruit";
import PdaProfile from "@/pages/pda/PdaProfile";
import ParticipantDashboard from "@/pages/persofest/ParticipantDashboard";
import AdminDashboard from "@/pages/persofest/admin/AdminDashboard";
import AdminRounds from "@/pages/persofest/admin/AdminRounds";
import AdminParticipants from "@/pages/persofest/admin/AdminParticipants";
import AdminScoring from "@/pages/persofest/admin/AdminScoring";
import AdminLeaderboard from "@/pages/persofest/admin/AdminLeaderboard";
import AdminLogs from "@/pages/persofest/admin/AdminLogs";
import AdminLogin from "@/pages/persofest/admin/AdminLogin";

// Protected Route Components
const ProtectedParticipantRoute = ({ children }) => {
    const { user, loading } = useParticipantAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="neo-card animate-pulse">
                    <p className="font-heading text-xl">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <Navigate to="/persofest/login" replace />;
    }

    return children;
};

const ProtectedPdaRoute = ({ children, requirePf = false, requireHome = false }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="neo-card animate-pulse">
                    <p className="font-heading text-xl">Loading...</p>
                </div>
            </div>
        );
    }

    if (!user) {
        if (requirePf) {
            return <Navigate to="/persofest/admin" replace />;
        }
        return <Navigate to="/login" replace />;
    }
    if (requirePf && !user.is_superadmin && !user.policy?.pf) {
        return <Navigate to="/persofest/admin" replace />;
    }
    if (requireHome && !user.is_superadmin && !user.policy?.home) {
        return <Navigate to="/login" replace />;
    }

    return children;
};

const PublicRoute = ({ children }) => {
    const { user, loading } = useParticipantAuth();

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="neo-card animate-pulse">
                    <p className="font-heading text-xl">Loading...</p>
                </div>
            </div>
        );
    }

    if (user) {
        return <Navigate to="/persofest/dashboard" replace />;
    }

    return children;
};

const PersofestAdminEntry = () => {
    const { user, loading } = useAuth();
    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="neo-card animate-pulse">
                    <p className="font-heading text-xl">Loading...</p>
                </div>
            </div>
        );
    }
    if (!user || (!user.is_superadmin && !user.policy?.pf)) {
        return <AdminLogin />;
    }
    return <AdminDashboard />;
};

function AppRoutes() {
    return (
        <Routes>
            {/* Public Routes */}
            <Route path="/" element={<PdaHome />} />
            <Route path="/login" element={<PdaLogin />} />
            <Route path="/recruit" element={<PdaRecruit />} />
            <Route path="/pda/profile" element={
                <ProtectedPdaRoute>
                    <PdaProfile />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin" element={<ItemsAdmin />} />
            <Route path="/admin/items" element={<ItemsAdmin />} />
            <Route path="/admin/team" element={<TeamAdmin />} />
            <Route path="/admin/gallery" element={<GalleryAdmin />} />
            <Route path="/admin/recruitments" element={<RecruitmentsAdmin />} />
            <Route path="/admin/logs" element={<LogsAdmin />} />
            <Route path="/admin/superadmin" element={<SuperAdmin />} />
            <Route path="/persofest" element={<PersofestHome />} />
            <Route path="/persofest/login" element={
                <PublicRoute>
                    <LoginPage />
                </PublicRoute>
            } />
            <Route path="/persofest/register" element={
                <PublicRoute>
                    <RegisterPage />
                </PublicRoute>
            } />

            {/* Participant Routes */}
            <Route path="/persofest/dashboard" element={
                <ProtectedParticipantRoute>
                    <ParticipantDashboard />
                </ProtectedParticipantRoute>
            } />

            {/* Admin Routes */}
            <Route path="/persofest/admin" element={<PersofestAdminEntry />} />
            <Route path="/persofest/admin/rounds" element={
                <ProtectedPdaRoute requirePf>
                    <AdminRounds />
                </ProtectedPdaRoute>
            } />
            <Route path="/persofest/admin/participants" element={
                <ProtectedPdaRoute requirePf>
                    <AdminParticipants />
                </ProtectedPdaRoute>
            } />
            <Route path="/persofest/admin/scoring/:roundId" element={
                <ProtectedPdaRoute requirePf>
                    <AdminScoring />
                </ProtectedPdaRoute>
            } />
            <Route path="/persofest/admin/leaderboard" element={
                <ProtectedPdaRoute requirePf>
                    <AdminLeaderboard />
                </ProtectedPdaRoute>
            } />
            <Route path="/persofest/admin/logs" element={
                <ProtectedPdaRoute requirePf>
                    <AdminLogs />
                </ProtectedPdaRoute>
            } />

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <AuthProvider>
            <ParticipantAuthProvider>
                <BrowserRouter>
                    <AppRoutes />
                    <Toaster position="top-right" richColors />
                </BrowserRouter>
            </ParticipantAuthProvider>
        </AuthProvider>
    );
}

export default App;

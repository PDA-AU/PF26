import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";

// Pages
import PersofestHome from "@/pages/persofest/PersofestHome";
import PdaHome from "@/pages/PdaHome";
import PdaAdmin from "@/pages/PdaAdmin";
import LoginPage from "@/pages/persofest/LoginPage";
import RegisterPage from "@/pages/persofest/RegisterPage";
import ParticipantDashboard from "@/pages/persofest/ParticipantDashboard";
import AdminDashboard from "@/pages/persofest/admin/AdminDashboard";
import AdminRounds from "@/pages/persofest/admin/AdminRounds";
import AdminParticipants from "@/pages/persofest/admin/AdminParticipants";
import AdminScoring from "@/pages/persofest/admin/AdminScoring";
import AdminLeaderboard from "@/pages/persofest/admin/AdminLeaderboard";

// Protected Route Components
const ProtectedRoute = ({ children, adminOnly = false }) => {
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
        return <Navigate to="/login" replace />;
    }

    if (adminOnly && user.role !== 'admin') {
        return <Navigate to="/dashboard" replace />;
    }

    return children;
};

const PublicRoute = ({ children }) => {
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

    if (user) {
        return <Navigate to={user.role === 'admin' ? '/admin' : '/dashboard'} replace />;
    }

    return children;
};

function AppRoutes() {
    return (
        <Routes>
            {/* Public Routes */}
            <Route path="/" element={<PdaHome />} />
            <Route path="/pda-admin" element={<PdaAdmin />} />
            <Route path="/persofest" element={<PersofestHome />} />
            <Route path="/login" element={
                <PublicRoute>
                    <LoginPage />
                </PublicRoute>
            } />
            <Route path="/register" element={
                <PublicRoute>
                    <RegisterPage />
                </PublicRoute>
            } />

            {/* Participant Routes */}
            <Route path="/dashboard" element={
                <ProtectedRoute>
                    <ParticipantDashboard />
                </ProtectedRoute>
            } />

            {/* Admin Routes */}
            <Route path="/admin" element={
                <ProtectedRoute adminOnly>
                    <AdminDashboard />
                </ProtectedRoute>
            } />
            <Route path="/admin/rounds" element={
                <ProtectedRoute adminOnly>
                    <AdminRounds />
                </ProtectedRoute>
            } />
            <Route path="/admin/participants" element={
                <ProtectedRoute adminOnly>
                    <AdminParticipants />
                </ProtectedRoute>
            } />
            <Route path="/admin/scoring/:roundId" element={
                <ProtectedRoute adminOnly>
                    <AdminScoring />
                </ProtectedRoute>
            } />
            <Route path="/admin/leaderboard" element={
                <ProtectedRoute adminOnly>
                    <AdminLeaderboard />
                </ProtectedRoute>
            } />

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <AuthProvider>
            <BrowserRouter>
                <AppRoutes />
                <Toaster position="top-right" richColors />
            </BrowserRouter>
        </AuthProvider>
    );
}

export default App;

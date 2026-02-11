import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";

// Pages
import PdaHome from "@/pages/PdaHome";
import ItemsAdmin from "@/pages/HomeAdmin/ItemsAdmin";
import UsersAdmin from "@/pages/HomeAdmin/UsersAdmin";
import TeamAdmin from "@/pages/HomeAdmin/TeamAdmin";
import GalleryAdmin from "@/pages/HomeAdmin/GalleryAdmin";
import SuperAdmin from "@/pages/HomeAdmin/SuperAdmin";
import LogsAdmin from "@/pages/HomeAdmin/LogsAdmin";
import RecruitmentsAdmin from "@/pages/HomeAdmin/RecruitmentsAdmin";
import AdminEvents from "@/pages/events/AdminEvents";
import EventDashboard from "@/pages/events/EventDashboard";
import EventAdminDashboardPage from "@/pages/events/admin/EventAdminDashboardPage";
import EventAdminAttendancePage from "@/pages/events/admin/EventAdminAttendancePage";
import EventAdminRoundsPage from "@/pages/events/admin/EventAdminRoundsPage";
import EventAdminScoringPage from "@/pages/events/admin/EventAdminScoringPage";
import EventAdminParticipantsPage from "@/pages/events/admin/EventAdminParticipantsPage";
import EventAdminLeaderboardPage from "@/pages/events/admin/EventAdminLeaderboardPage";
import EventAdminLogsPage from "@/pages/events/admin/EventAdminLogsPage";
import EventAdminBadgesPage from "@/pages/events/admin/EventAdminBadgesPage";
import PdaLogin from "@/pages/pda/PdaLogin";
import PdaRecruit from "@/pages/pda/PdaRecruit";
import PdaSignup from "@/pages/pda/PdaSignup";
import PdaProfile from "@/pages/pda/PdaProfile";
import PdaVerifyEmail from "@/pages/pda/VerifyEmail";
import PdaForgotPassword from "@/pages/pda/ForgotPassword";
import PdaResetPassword from "@/pages/pda/ResetPassword";
import PersohubFeedPage from "@/pages/persohub/PersohubFeedPage";
import PersohubPostPage from "@/pages/persohub/PersohubPostPage";
import PersohubProfilePage from "@/pages/persohub/PersohubProfilePage";

// Protected Route Components
const ProtectedPdaRoute = ({ children, requirePf = false, requireHome = false, requireSuperAdmin = false, requireEvents = false }) => {
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
    if (requireSuperAdmin && !user.is_superadmin) {
        return <Navigate to="/admin" replace />;
    }
    if (requirePf && !user.is_superadmin) return <Navigate to="/login" replace />;
    if (requireHome && !user.is_superadmin && !user.policy?.home) {
        return <Navigate to="/login" replace />;
    }
    if (requireEvents && !user.is_superadmin) {
        const eventsPolicy = (user.policy && typeof user.policy.events === 'object') ? user.policy.events : null;
        const hasAnyEventAccess = !!eventsPolicy && Object.values(eventsPolicy).some((value) => Boolean(value));
        if (!hasAnyEventAccess) {
            return <Navigate to="/login" replace />;
        }
    }

    return children;
};

const EventAdminBaseRedirect = () => {
    const { eventSlug } = useParams();
    if (!eventSlug) return <Navigate to="/admin/events" replace />;
    return <Navigate to={`/admin/events/${eventSlug}/dashboard`} replace />;
};

const EventAdminBaseRedirectLegacy = () => {
    const { eventSlug } = useParams();
    if (!eventSlug) return <Navigate to="/admin/events" replace />;
    return <Navigate to={`/admin/events/${eventSlug}/dashboard`} replace />;
};

function AppRoutes() {
    return (
        <Routes>
            {/* Public Routes */}
            <Route path="/" element={<PdaHome />} />
            <Route path="/login" element={<PdaLogin />} />
            <Route path="/signup" element={<PdaSignup />} />
            <Route path="/recruit" element={<PdaRecruit />} />
            <Route path="/verify-email" element={<PdaVerifyEmail />} />
            <Route path="/forgot-password" element={<PdaForgotPassword />} />
            <Route path="/reset-password" element={<PdaResetPassword />} />
            <Route path="/profile" element={
                <ProtectedPdaRoute>
                    <PdaProfile />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin" element={<ItemsAdmin />} />
            <Route path="/admin/items" element={<ItemsAdmin />} />
            <Route path="/admin/users" element={<UsersAdmin />} />
            <Route path="/admin/team" element={<TeamAdmin />} />
            <Route path="/admin/gallery" element={<GalleryAdmin />} />
            <Route path="/admin/events" element={
                <ProtectedPdaRoute requireEvents>
                    <AdminEvents />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/event/:eventSlug" element={<EventAdminBaseRedirectLegacy />} />
            <Route path="/admin/events/:eventSlug" element={<EventAdminBaseRedirect />} />
            <Route path="/admin/events/:eventSlug/dashboard" element={
                <ProtectedPdaRoute requireEvents>
                    <EventAdminDashboardPage />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/events/:eventSlug/attendance" element={
                <ProtectedPdaRoute requireEvents>
                    <EventAdminAttendancePage />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/events/:eventSlug/rounds" element={
                <ProtectedPdaRoute requireEvents>
                    <EventAdminRoundsPage />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/events/:eventSlug/rounds/:roundId/scoring" element={
                <ProtectedPdaRoute requireEvents>
                    <EventAdminScoringPage />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/events/:eventSlug/participants" element={
                <ProtectedPdaRoute requireEvents>
                    <EventAdminParticipantsPage />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/events/:eventSlug/leaderboard" element={
                <ProtectedPdaRoute requireEvents>
                    <EventAdminLeaderboardPage />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/events/:eventSlug/badges" element={
                <ProtectedPdaRoute requireEvents>
                    <EventAdminBadgesPage />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/events/:eventSlug/logs" element={
                <ProtectedPdaRoute requireEvents>
                    <EventAdminLogsPage />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/recruitments" element={
                <ProtectedPdaRoute requireSuperAdmin>
                    <RecruitmentsAdmin />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/logs" element={<LogsAdmin />} />
            <Route path="/admin/superadmin" element={<SuperAdmin />} />
            <Route path="/event/:eventSlug" element={<EventDashboard />} />
            <Route path="/event/:eventSlug/:profileName" element={<EventDashboard />} />
            <Route path="/events/:eventSlug" element={<EventDashboard />} />
            <Route path="/events/:eventSlug/:profileName" element={<EventDashboard />} />
            <Route path="/persohub" element={<PersohubFeedPage />} />
            <Route path="/persohub/p/:slugToken" element={<PersohubPostPage />} />
            <Route path="/persohub/:profileName" element={<PersohubProfilePage />} />

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

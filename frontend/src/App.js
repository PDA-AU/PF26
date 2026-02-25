import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useParams } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import LoadingState from "@/components/common/LoadingState";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import { PersohubActorProvider } from "@/context/PersohubActorContext";
import { PersohubAdminAuthProvider, usePersohubAdminAuth } from "@/context/PersohubAdminAuthContext";

// Pages
import PdaHome from "@/pages/PdaHome";
import ItemsAdmin from "@/pages/HomeAdmin/ItemsAdmin";
import UsersAdmin from "@/pages/HomeAdmin/UsersAdmin";
import TeamAdmin from "@/pages/HomeAdmin/TeamAdmin";
import GalleryAdmin from "@/pages/HomeAdmin/GalleryAdmin";
import SuperAdmin from "@/pages/HomeAdmin/SuperAdmin";
import LogsAdmin from "@/pages/HomeAdmin/LogsAdmin";
import RecruitmentsAdmin from "@/pages/HomeAdmin/RecruitmentsAdmin";
import EmailAdmin from "@/pages/HomeAdmin/EmailAdmin";
import CCAdmin from "@/pages/HomeAdmin/CCAdmin";
import BadgesAdmin from "@/pages/HomeAdmin/BadgesAdmin";
import PersohubPaymentsAdminPage from "@/pages/HomeAdmin/PersohubPaymentsAdminPage";
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
import EventAdminEmailPage from "@/pages/events/admin/EventAdminEmailPage";
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
import ChakravyuhaTmpEditorPage from "@/pages/persohub/tmp/ChakravyuhaTmpEditorPage";
import PersohubAdminEntryPage from "@/pages/persohub/admin/PersohubAdminEntryPage";
import PersohubAdminProfilePage from "@/pages/persohub/admin/PersohubAdminProfilePage";
import PersohubAdminCommunitiesPage from "@/pages/persohub/admin/PersohubAdminCommunitiesPage";
import PersohubAdminEventsPage from "@/pages/persohub/admin/PersohubAdminEventsPage";
import PersohubAdminPoliciesPage from "@/pages/persohub/admin/PersohubAdminPoliciesPage";
import PersohubAdminPaymentsPage from "@/pages/persohub/admin/PersohubAdminPaymentsPage";
import PersohubEventDashboard from "@/pages/persohub/events/PersohubEventDashboard";
import PersohubEventAdminDashboardPage from "@/pages/persohub/events/admin/EventAdminDashboardPage";
import PersohubEventAdminAttendancePage from "@/pages/persohub/events/admin/EventAdminAttendancePage";
import PersohubEventAdminRoundsPage from "@/pages/persohub/events/admin/EventAdminRoundsPage";
import PersohubEventAdminScoringPage from "@/pages/persohub/events/admin/EventAdminScoringPage";
import PersohubEventAdminParticipantsPage from "@/pages/persohub/events/admin/EventAdminParticipantsPage";
import PersohubEventAdminLeaderboardPage from "@/pages/persohub/events/admin/EventAdminLeaderboardPage";
import PersohubEventAdminLogsPage from "@/pages/persohub/events/admin/EventAdminLogsPage";
import PersohubEventAdminBadgesPage from "@/pages/persohub/events/admin/EventAdminBadgesPage";
import PersohubEventAdminEmailPage from "@/pages/persohub/events/admin/EventAdminEmailPage";

// Protected Route Components
const ProtectedPdaRoute = ({ children, requirePf = false, requireHome = false, requireSuperAdmin = false, requireEvents = false }) => {
    const { user, loading } = useAuth();

    if (loading) {
        return <LoadingState fullScreen />;
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

const PersohubEventAdminBaseRedirect = () => {
    const { eventSlug } = useParams();
    if (!eventSlug) return <Navigate to="/persohub/admin/persohub-events" replace />;
    return <Navigate to={`/persohub/admin/persohub-events/${eventSlug}/dashboard`} replace />;
};

const ProtectedPersohubEventsRoute = ({ children }) => {
    const { community, loading } = usePersohubAdminAuth();

    if (loading) {
        return <LoadingState fullScreen />;
    }

    if (!community) {
        return <Navigate to="/persohub/admin" replace />;
    }

    if (!community.is_club_owner && !community.is_club_superadmin) {
        return <Navigate to="/persohub/admin" replace />;
    }

    return children;
};

const ProtectedPersohubClubAdminRoute = ({ children }) => {
    const { community, loading } = usePersohubAdminAuth();

    if (loading) {
        return <LoadingState fullScreen />;
    }

    if (!community) {
        return <Navigate to="/persohub/admin" replace />;
    }

    if (!community.is_club_owner && !community.is_club_superadmin) {
        return <Navigate to="/persohub/admin" replace />;
    }

    return children;
};

const ProtectedPersohubOwnerRoute = ({ children }) => {
    const { community, loading } = usePersohubAdminAuth();

    if (loading) {
        return <LoadingState fullScreen />;
    }

    if (!community) {
        return <Navigate to="/persohub/admin" replace />;
    }

    if (!community.is_club_owner) {
        return <Navigate to="/persohub/admin" replace />;
    }

    return children;
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
            <Route path="/admin/email" element={
                <ProtectedPdaRoute requireSuperAdmin>
                    <EmailAdmin />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/cc" element={
                <ProtectedPdaRoute requireSuperAdmin>
                    <CCAdmin />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/badges" element={
                <ProtectedPdaRoute requireSuperAdmin>
                    <BadgesAdmin />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/payments" element={
                <ProtectedPdaRoute requireSuperAdmin>
                    <PersohubPaymentsAdminPage />
                </ProtectedPdaRoute>
            } />
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
            <Route path="/admin/events/:eventSlug/email" element={
                <ProtectedPdaRoute requireEvents>
                    <EventAdminEmailPage />
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
            <Route path="/persohub/tmp/chakravyuha" element={
                <ProtectedPdaRoute requireSuperAdmin>
                    <ChakravyuhaTmpEditorPage />
                </ProtectedPdaRoute>
            } />
            <Route path="/persohub/admin" element={<PersohubAdminEntryPage />} />
            <Route path="/persohub/admin/profile" element={
                <ProtectedPersohubClubAdminRoute>
                    <PersohubAdminProfilePage />
                </ProtectedPersohubClubAdminRoute>
            } />
            <Route path="/persohub/admin/communities" element={
                <ProtectedPersohubClubAdminRoute>
                    <PersohubAdminCommunitiesPage />
                </ProtectedPersohubClubAdminRoute>
            } />
            <Route path="/persohub/admin/policies" element={
                <ProtectedPersohubOwnerRoute>
                    <PersohubAdminPoliciesPage />
                </ProtectedPersohubOwnerRoute>
            } />
            <Route path="/persohub/admin/payments" element={
                <ProtectedPersohubClubAdminRoute>
                    <PersohubAdminPaymentsPage />
                </ProtectedPersohubClubAdminRoute>
            } />
            <Route path="/persohub/admin/persohub-events" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubAdminEventsPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/persohub-events/:eventSlug" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminBaseRedirect />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/persohub-events/:eventSlug/dashboard" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminDashboardPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/persohub-events/:eventSlug/attendance" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminAttendancePage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/persohub-events/:eventSlug/rounds" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminRoundsPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/persohub-events/:eventSlug/rounds/:roundId/scoring" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminScoringPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/persohub-events/:eventSlug/participants" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminParticipantsPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/persohub-events/:eventSlug/leaderboard" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminLeaderboardPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/persohub-events/:eventSlug/email" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminEmailPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/persohub-events/:eventSlug/badges" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminBadgesPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/persohub-events/:eventSlug/logs" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminLogsPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/events/:eventSlug" element={<PersohubEventDashboard />} />
            <Route path="/persohub/events/:eventSlug/:profileName" element={<PersohubEventDashboard />} />
            <Route path="/persohub/:profileName" element={<PersohubProfilePage />} />

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

function App() {
    return (
        <AuthProvider>
            <PersohubActorProvider>
                <PersohubAdminAuthProvider>
                    <BrowserRouter>
                        <AppRoutes />
                        <Toaster position="top-right" richColors />
                    </BrowserRouter>
                </PersohubAdminAuthProvider>
            </PersohubActorProvider>
        </AuthProvider>
    );
}

export default App;

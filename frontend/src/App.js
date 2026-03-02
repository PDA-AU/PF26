import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useParams } from "react-router-dom";
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

const PersohubEventAdminBaseRedirect = () => {
    const { eventSlug } = useParams();
    if (!eventSlug) return <Navigate to="/persohub/admin/events" replace />;
    return <Navigate to={`/persohub/admin/events/${eventSlug}/dashboard`} replace />;
};

const LegacyEventsRouteRedirect = () => {
    const { "*": rest = "" } = useParams();
    const location = useLocation();
    const targetPath = String(rest || "").trim()
        ? `/persohub/events/${rest}`
        : "/persohub/events";
    return <Navigate to={`${targetPath}${location.search || ""}${location.hash || ""}`} replace />;
};

const LegacyPersohubAdminEventsRouteRedirect = () => {
    const { "*": rest = "" } = useParams();
    const location = useLocation();
    const targetPath = String(rest || "").trim()
        ? `/persohub/admin/events/${rest}`
        : "/persohub/admin/events";
    return <Navigate to={`${targetPath}${location.search || ""}${location.hash || ""}`} replace />;
};

const ProtectedPersohubEventsRoute = ({ children }) => {
    const { community, loading, mode, activeCommunityId } = usePersohubAdminAuth();

    if (loading) {
        return <LoadingState fullScreen />;
    }
    if (mode === 'community' && activeCommunityId && !community) {
        return <LoadingState fullScreen />;
    }

    if (!community) {
        return <Navigate to="/persohub/admin" replace />;
    }

    if (!community.can_access_events) {
        return <Navigate to="/persohub/admin" replace />;
    }

    return children;
};

const ProtectedPersohubClubAdminRoute = ({ children }) => {
    const { community, loading, mode, activeCommunityId } = usePersohubAdminAuth();

    if (loading) {
        return <LoadingState fullScreen />;
    }
    if (mode === 'community' && activeCommunityId && !community) {
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
    const { community, loading, mode, activeCommunityId } = usePersohubAdminAuth();

    if (loading) {
        return <LoadingState fullScreen />;
    }
    if (mode === 'community' && activeCommunityId && !community) {
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
            <Route path="/admin/event/:eventSlug" element={<Navigate to="/persohub/admin" replace />} />
            <Route path="/admin/events/*" element={<Navigate to="/persohub/admin" replace />} />
            <Route path="/admin/recruitments" element={
                <ProtectedPdaRoute requireSuperAdmin>
                    <RecruitmentsAdmin />
                </ProtectedPdaRoute>
            } />
            <Route path="/admin/logs" element={<LogsAdmin />} />
            <Route path="/admin/superadmin" element={<SuperAdmin />} />
            <Route path="/event/*" element={<LegacyEventsRouteRedirect />} />
            <Route path="/events/*" element={<LegacyEventsRouteRedirect />} />
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
            <Route path="/persohub/admin/persohub-events/*" element={<LegacyPersohubAdminEventsRouteRedirect />} />
            <Route path="/persohub/admin/events" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubAdminEventsPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/events/:eventSlug" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminBaseRedirect />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/events/:eventSlug/dashboard" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminDashboardPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/events/:eventSlug/attendance" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminAttendancePage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/events/:eventSlug/rounds" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminRoundsPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/events/:eventSlug/rounds/:roundId/scoring" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminScoringPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/events/:eventSlug/participants" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminParticipantsPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/events/:eventSlug/leaderboard" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminLeaderboardPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/events/:eventSlug/email" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminEmailPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/events/:eventSlug/badges" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminBadgesPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/admin/events/:eventSlug/logs" element={
                <ProtectedPersohubEventsRoute>
                    <PersohubEventAdminLogsPage />
                </ProtectedPersohubEventsRoute>
            } />
            <Route path="/persohub/events/personasync" element={<Navigate to="/persohub?hashtag=PERSONASYNC" replace />} />
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
